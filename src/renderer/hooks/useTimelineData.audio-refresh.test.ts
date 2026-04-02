import { describe, expect, it, jest } from '@jest/globals';
import {
  attachWaveformPeaksToAudioFiles,
  collectAudioFilesWithDuration,
  runLatestAsyncTask,
} from './useTimelineData';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  // eslint-disable-next-line compat/compat
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

describe('useTimelineData audio refresh helpers', () => {
  it('commits only the latest overlapping async request', async () => {
    const requestRef = { current: 0 };
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const committed: string[] = [];

    const firstRun = runLatestAsyncTask({
      requestRef,
      task: () => first.promise,
      commit: (value) => committed.push(`first:${value}`),
    });
    const secondRun = runLatestAsyncTask({
      requestRef,
      task: () => second.promise,
      commit: (value) => committed.push(`second:${value}`),
    });

    second.resolve('newer');
    expect(await secondRun).toBe(true);

    first.resolve('older');
    expect(await firstRun).toBe(false);

    expect(committed).toEqual(['second:newer']);
  });

  it('falls back to transcript duration when audio duration probing fails', async () => {
    const getAudioDuration = jest.fn(async (audioPath: string) => {
      if (audioPath.endsWith('/ok.mp3')) return 12;
      throw new Error('ffprobe failed');
    });

    const result = await collectAudioFilesWithDuration({
      audioFiles: [
        { path: 'assets/audio/ok.mp3', duration: 0 },
        { path: 'assets/audio/broken.wav', duration: 0 },
      ],
      projectDirectory: '/project',
      transcriptDuration: 7,
      getAudioDuration,
    });

    expect(result).toEqual([
      { path: 'assets/audio/ok.mp3', duration: 12 },
      { path: 'assets/audio/broken.wav', duration: 7 },
    ]);
    expect(getAudioDuration).toHaveBeenCalledTimes(2);
  });

  it('attaches waveform peaks while preserving files that fail extraction', async () => {
    const result = await attachWaveformPeaksToAudioFiles({
      audioFiles: [
        { path: 'assets/audio/ok.mp3', duration: 12 },
        { path: 'assets/audio/broken.wav', duration: 7 },
      ],
      projectDirectory: '/project',
      getAudioWaveform: jest.fn(async (audioPath: string) => {
        if (audioPath.endsWith('/ok.mp3')) {
          return {
            peaks: [0.1, 0.6, 1],
            duration: 12,
          };
        }

        throw new Error('waveform extraction failed');
      }),
    });

    expect(result).toEqual([
      {
        path: 'assets/audio/ok.mp3',
        duration: 12,
        waveformPeaks: [0.1, 0.6, 1],
      },
      {
        path: 'assets/audio/broken.wav',
        duration: 7,
      },
    ]);
  });
});
