import { describe, expect, it } from '@jest/globals';
import {
  buildDisplayOptions,
  normalizeAutoApproveSeconds,
} from './QuestionPrompt';

describe('QuestionPrompt helpers', () => {
  it('converts auto-approve milliseconds into seconds', () => {
    expect(normalizeAutoApproveSeconds(5000)).toBe(5);
    expect(normalizeAutoApproveSeconds(undefined)).toBeNull();
  });

  it('keeps rich options with descriptions when provided', () => {
    const options = buildDisplayOptions(
      [{ label: 'Yes', description: 'Continue with the write' }],
      'confirm',
      true,
    );

    expect(options).toEqual([
      { label: 'Yes', description: 'Continue with the write' },
    ]);
  });

  it('falls back to yes/no options for confirmations', () => {
    expect(buildDisplayOptions(undefined, 'confirm', true)).toEqual([
      { label: 'Yes' },
      { label: 'No' },
    ]);
  });
});
