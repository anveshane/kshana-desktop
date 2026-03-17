import { act, render } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import QuestionPrompt from './QuestionPrompt';

describe('QuestionPrompt auto-approve', () => {
  it('submits the first option when timeout expires without an explicit default', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).toHaveBeenCalledWith('Proceed');
    jest.useRealTimers();
  });

  it('prefers the explicit default option over the first option', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Skip' }]}
        type="select"
        defaultOption="Skip"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).toHaveBeenCalledWith('Skip');
    jest.useRealTimers();
  });

  it('does not auto-submit free-text questions without a default', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <QuestionPrompt
        question="Tell me more"
        type="text"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
