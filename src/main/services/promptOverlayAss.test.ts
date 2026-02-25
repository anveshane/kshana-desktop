import { describe, expect, it } from '@jest/globals';
import {
  buildAssFromPromptOverlayCues,
  wrapPromptTextForAss,
} from './promptOverlayAss';

describe('promptOverlayAss', () => {
  it('wrapPromptTextForAss escapes ASS-special braces and wraps lines', () => {
    const wrapped = wrapPromptTextForAss(
      'This {prompt} has \\slashes\\ and should wrap over multiple words to stay readable',
      24,
      3,
    );

    expect(wrapped).toContain('(prompt)');
    expect(wrapped).not.toContain('{prompt}');
    expect(wrapped).toContain('\\\\slashes\\\\');
    expect(wrapped).toContain('\\N');
  });

  it('wrapPromptTextForAss truncates to bounded max lines', () => {
    const wrapped = wrapPromptTextForAss(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen',
      10,
      2,
    );

    const lines = wrapped.split('\\N');
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(wrapped.endsWith('\u2026')).toBe(true);
  });

  it('buildAssFromPromptOverlayCues builds prompt dialogue events', () => {
    const ass = buildAssFromPromptOverlayCues([
      {
        id: 'cue-1',
        startTime: 8,
        endTime: 24,
        text: 'A valid prompt cue',
      },
      {
        id: 'cue-2',
        startTime: 30,
        endTime: 30,
        text: 'invalid zero-length cue',
      },
    ]);

    expect(ass).toContain('Style: PromptTop');
    expect(ass).toContain('Dialogue: 0,0:00:08.00,0:00:24.00,PromptTop');
    expect(ass).not.toContain('invalid zero-length cue');
  });
});
