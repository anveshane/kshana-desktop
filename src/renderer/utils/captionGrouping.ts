import type {
  WordTimestamp,
  TextOverlayCue,
  TextOverlayWord,
} from '../types/captions';

const MIN_WORDS_FOR_SOFT_SPLIT = 3;
const MAX_WORDS_PER_CUE = 6;
const MAX_CUE_DURATION_SECONDS = 2.5;
const SILENCE_SPLIT_SECONDS = 0.45;

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function sanitizeWord(raw: WordTimestamp): WordTimestamp | null {
  const text = raw.text?.trim();
  if (!text) return null;

  const startTime = clampNonNegative(raw.startTime);
  const endTime = clampNonNegative(raw.endTime);
  if (endTime <= startTime) return null;

  return {
    text,
    startTime,
    endTime,
    confidence: raw.confidence,
  };
}

export function sanitizeWordTimestamps(words: WordTimestamp[]): WordTimestamp[] {
  const sanitized: WordTimestamp[] = [];
  let previousEnd = 0;

  words
    .map(sanitizeWord)
    .filter((word): word is WordTimestamp => word !== null)
    .sort((a, b) => a.startTime - b.startTime)
    .forEach((word) => {
      const startTime = Math.max(word.startTime, previousEnd);
      const endTime = Math.max(word.endTime, startTime + 0.01);
      sanitized.push({
        ...word,
        startTime,
        endTime,
      });
      previousEnd = endTime;
    });

  return sanitized;
}

function endsWithPunctuation(word: string): boolean {
  return /[.!?…,:;]$/.test(word);
}

function shouldSoftSplit(currentWords: WordTimestamp[], nextWord: WordTimestamp): boolean {
  if (currentWords.length < MIN_WORDS_FOR_SOFT_SPLIT) return false;
  const lastWord = currentWords[currentWords.length - 1];
  if (!lastWord) return false;

  if (endsWithPunctuation(lastWord.text)) {
    return true;
  }

  const silenceGap = nextWord.startTime - lastWord.endTime;
  return silenceGap > SILENCE_SPLIT_SECONDS;
}

function shouldHardSplit(currentWords: WordTimestamp[], nextWord: WordTimestamp): boolean {
  if (currentWords.length === 0) return false;
  if (currentWords.length >= MAX_WORDS_PER_CUE) return true;
  const cueStart = currentWords[0]!.startTime;
  return nextWord.endTime - cueStart > MAX_CUE_DURATION_SECONDS;
}

function buildCue(words: WordTimestamp[], cueIndex: number): TextOverlayCue | null {
  if (words.length === 0) return null;

  const textParts: string[] = [];
  const overlayWords: TextOverlayWord[] = [];
  let cursor = 0;

  words.forEach((word, index) => {
    const prefix = index > 0 ? ' ' : '';
    const token = `${prefix}${word.text}`;
    textParts.push(token);

    const charStart = cursor + prefix.length;
    const charEnd = charStart + word.text.length;
    overlayWords.push({
      text: word.text,
      startTime: word.startTime,
      endTime: word.endTime,
      charStart,
      charEnd,
    });
    cursor += token.length;
  });

  return {
    id: `caption-cue-${cueIndex}`,
    startTime: words[0]!.startTime,
    endTime: words[words.length - 1]!.endTime,
    text: textParts.join(''),
    words: overlayWords,
  };
}

export function groupWordsIntoCues(words: WordTimestamp[]): TextOverlayCue[] {
  const sanitized = sanitizeWordTimestamps(words);
  if (sanitized.length === 0) return [];

  const cues: TextOverlayCue[] = [];
  let currentWords: WordTimestamp[] = [];
  let cueIndex = 1;

  const flushCurrentCue = () => {
    const cue = buildCue(currentWords, cueIndex);
    if (cue) {
      cues.push(cue);
      cueIndex += 1;
    }
    currentWords = [];
  };

  for (let i = 0; i < sanitized.length; i += 1) {
    const word = sanitized[i]!;
    const nextWord = sanitized[i + 1];
    currentWords.push(word);

    if (!nextWord) {
      flushCurrentCue();
      break;
    }

    if (
      shouldHardSplit(currentWords, nextWord) ||
      shouldSoftSplit(currentWords, nextWord)
    ) {
      flushCurrentCue();
    }
  }

  return cues;
}

export function getActiveCue(
  cues: TextOverlayCue[],
  timeSeconds: number,
): TextOverlayCue | null {
  return (
    cues.find((cue) => timeSeconds >= cue.startTime && timeSeconds < cue.endTime) ??
    null
  );
}

export function getActiveWordIndex(
  cue: TextOverlayCue | null,
  timeSeconds: number,
): number {
  if (!cue) return -1;
  return cue.words.findIndex(
    (word) => timeSeconds >= word.startTime && timeSeconds < word.endTime,
  );
}

