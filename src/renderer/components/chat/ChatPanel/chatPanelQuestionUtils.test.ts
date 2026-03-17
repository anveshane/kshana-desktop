import { describe, expect, it } from '@jest/globals';
import { getImmediateAutoQuestionResponse } from './chatPanelQuestionUtils';

describe('chatPanelQuestionUtils', () => {
  it('immediately auto-submits the first option when timeout is zero', () => {
    expect(
      getImmediateAutoQuestionResponse({
        options: [{ label: 'Proceed' }, { label: 'Other' }],
        questionType: 'select',
        isConfirmation: false,
        autoApproveTimeoutMs: 0,
      }),
    ).toBe('Proceed');
  });

  it('respects an explicit default option for immediate auto-submit', () => {
    expect(
      getImmediateAutoQuestionResponse({
        options: [{ label: 'Proceed' }, { label: 'Skip' }],
        questionType: 'select',
        isConfirmation: false,
        autoApproveTimeoutMs: 0,
        defaultOption: 'Skip',
      }),
    ).toBe('Skip');
  });

  it('does not auto-submit when the fallback would be Other or free text', () => {
    expect(
      getImmediateAutoQuestionResponse({
        options: [{ label: 'Other' }, { label: 'Proceed' }],
        questionType: 'select',
        isConfirmation: false,
        autoApproveTimeoutMs: 0,
      }),
    ).toBeUndefined();

    expect(
      getImmediateAutoQuestionResponse({
        questionType: 'text',
        isConfirmation: false,
        autoApproveTimeoutMs: 0,
      }),
    ).toBeUndefined();
  });
});
