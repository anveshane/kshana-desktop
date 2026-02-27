export interface PromptOverlayCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

const DEFAULT_MAX_LINE_LENGTH = 56;
const DEFAULT_MAX_LINES = 4;

function formatAssTimestamp(seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function escapeAssText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '(')
    .replace(/}/g, ')')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function splitLongWord(word: string, maxLength: number): string[] {
  if (word.length <= maxLength) {
    return [word];
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < word.length) {
    chunks.push(word.slice(offset, offset + maxLength));
    offset += maxLength;
  }
  return chunks;
}

function applyEllipsis(line: string, maxLength: number): string {
  if (line.length <= maxLength - 1) {
    return `${line}\u2026`;
  }
  return `${line.slice(0, Math.max(1, maxLength - 1)).trimEnd()}\u2026`;
}

export function wrapPromptTextForAss(
  rawText: string,
  maxLineLength: number = DEFAULT_MAX_LINE_LENGTH,
  maxLines: number = DEFAULT_MAX_LINES,
): string {
  const sanitized = escapeAssText(rawText).replace(/\s+/g, ' ').trim();
  if (!sanitized) return '';

  const words = sanitized
    .split(' ')
    .flatMap((word) => splitLongWord(word, maxLineLength));
  const lines: string[] = [];
  let current = '';
  let truncated = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxLineLength) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = '';
    }

    if (lines.length >= maxLines) {
      truncated = true;
      current = '';
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (current) {
    truncated = true;
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
    truncated = true;
  }

  if (truncated && lines.length > 0) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = applyEllipsis(lines[lastIndex], maxLineLength);
  }

  return lines.join('\\N');
}

export function buildAssFromPromptOverlayCues(
  cues: PromptOverlayCue[],
): string {
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding',
    'Style: PromptTop,Arial,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,3,2,0,8,80,80,56,1',
    '',
    '[Events]',
    'Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text',
  ];

  const events = cues
    .filter((cue) => Number.isFinite(cue.startTime) && Number.isFinite(cue.endTime))
    .filter((cue) => cue.endTime > cue.startTime)
    .map((cue) => ({
      startTime: cue.startTime,
      endTime: cue.endTime,
      text: wrapPromptTextForAss(cue.text),
    }))
    .filter((cue) => cue.text.length > 0)
    .sort((a, b) => a.startTime - b.startTime)
    .map((cue) => {
      const start = formatAssTimestamp(cue.startTime);
      const end = formatAssTimestamp(cue.endTime);
      return `Dialogue: 0,${start},${end},PromptTop,,0,0,0,,${cue.text}`;
    });

  return [...header, ...events, ''].join('\n');
}
