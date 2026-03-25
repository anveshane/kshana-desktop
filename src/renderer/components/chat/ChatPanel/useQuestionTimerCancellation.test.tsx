import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import ChatInput from '../ChatInput';
import QuestionPrompt from '../QuestionPrompt';
import useQuestionTimerCancellation from './useQuestionTimerCancellation';

interface TimerHarnessProps {
  questionId: string;
  autoApproveTimeoutMs: number | undefined;
  onSelect: (response: string) => void;
}

function TimerHarness({
  questionId,
  autoApproveTimeoutMs,
  onSelect,
}: TimerHarnessProps) {
  const [questionTimerCancelledForId, setQuestionTimerCancelledForId] =
    useState<string | null>(null);

  const { cancelActiveQuestionTimer, effectiveAutoApproveTimeoutMs } =
    useQuestionTimerCancellation({
      activeQuestion: {
        id: questionId,
        autoApproveTimeoutMs,
      },
      questionTimerCancelledForId,
      setQuestionTimerCancelledForId,
    });

  return (
    <>
      <QuestionPrompt
        question="Continue?"
        options={[{ label: 'Proceed' }, { label: 'Other' }]}
        type="select"
        autoApproveTimeoutMs={effectiveAutoApproveTimeoutMs}
        onSelect={onSelect}
      />
      <ChatInput
        questionMode
        onQuestionInteraction={cancelActiveQuestionTimer}
        onSend={jest.fn()}
      />
      <div data-testid="effective-timeout">
        {effectiveAutoApproveTimeoutMs ?? 'none'}
      </div>
    </>
  );
}

describe('useQuestionTimerCancellation', () => {
  it('cancels the active timer on mouse movement without submitting a response', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <TimerHarness
        questionId="question-1"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});

    fireEvent.mouseMove(window);

    expect(screen.getByTestId('effective-timeout').textContent).toBe('none');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('cancels the active timer on early composer interaction', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    render(
      <TimerHarness
        questionId="question-1"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});

    fireEvent.focus(screen.getByLabelText('Chat input'));

    expect(screen.getByTestId('effective-timeout').textContent).toBe('none');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('resets cancellation state when a new question becomes active', async () => {
    jest.useFakeTimers();
    const onSelect = jest.fn();

    const { rerender } = render(
      <TimerHarness
        questionId="question-1"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    await act(async () => {});

    fireEvent.mouseMove(window);

    expect(screen.getByTestId('effective-timeout').textContent).toBe('none');

    rerender(
      <TimerHarness
        questionId="question-2"
        autoApproveTimeoutMs={1000}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByTestId('effective-timeout').textContent).toBe('1000');

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onSelect).toHaveBeenCalledWith('Proceed');
    jest.useRealTimers();
  });
});
