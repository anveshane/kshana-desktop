import { describe, expect, it } from '@jest/globals';
import {
  buildDisplayOptions,
  normalizeAutoApproveSeconds,
  resolveAutoApproveOption,
} from './questionPromptUtils';

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

  it('uses the first option as the implicit auto-approve default', () => {
    expect(
      resolveAutoApproveOption(
        [{ label: 'Proceed' }, { label: 'Other' }],
        'select',
        false,
      ),
    ).toBe('Proceed');
  });

  it('does not auto-approve Other unless it is explicit', () => {
    expect(
      resolveAutoApproveOption(
        [{ label: 'Other' }, { label: 'Proceed' }],
        'select',
        false,
      ),
    ).toBeUndefined();
    expect(
      resolveAutoApproveOption(
        [{ label: 'Other' }, { label: 'Proceed' }],
        'select',
        false,
        'Other',
      ),
    ).toBe('Other');
  });
});
