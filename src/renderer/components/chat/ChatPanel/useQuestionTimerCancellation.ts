import { Dispatch, SetStateAction, useCallback, useEffect } from 'react';

interface ActiveQuestionTimerState {
  id: string;
  autoApproveTimeoutMs?: number;
}

interface UseQuestionTimerCancellationArgs {
  activeQuestion: ActiveQuestionTimerState | null;
  questionTimerCancelledForId: string | null;
  setQuestionTimerCancelledForId: Dispatch<SetStateAction<string | null>>;
}

const hasCancelableTimer = (
  activeQuestion: ActiveQuestionTimerState | null,
): activeQuestion is ActiveQuestionTimerState & {
  autoApproveTimeoutMs: number;
} => {
  return (
    !!activeQuestion &&
    typeof activeQuestion.autoApproveTimeoutMs === 'number' &&
    Number.isFinite(activeQuestion.autoApproveTimeoutMs) &&
    activeQuestion.autoApproveTimeoutMs > 0
  );
};

export default function useQuestionTimerCancellation({
  activeQuestion,
  questionTimerCancelledForId,
  setQuestionTimerCancelledForId,
}: UseQuestionTimerCancellationArgs) {
  useEffect(() => {
    if (!activeQuestion) {
      setQuestionTimerCancelledForId(null);
      return;
    }

    setQuestionTimerCancelledForId((prev) =>
      prev === activeQuestion.id ? prev : null,
    );
  }, [activeQuestion, setQuestionTimerCancelledForId]);

  const cancelActiveQuestionTimer = useCallback(() => {
    if (!hasCancelableTimer(activeQuestion)) {
      return;
    }

    setQuestionTimerCancelledForId((prev) =>
      prev === activeQuestion.id ? prev : activeQuestion.id,
    );
  }, [activeQuestion, setQuestionTimerCancelledForId]);

  useEffect(() => {
    if (
      !hasCancelableTimer(activeQuestion) ||
      questionTimerCancelledForId === activeQuestion.id
    ) {
      return undefined;
    }

    window.addEventListener('mousemove', cancelActiveQuestionTimer);
    return () => {
      window.removeEventListener('mousemove', cancelActiveQuestionTimer);
    };
  }, [activeQuestion, cancelActiveQuestionTimer, questionTimerCancelledForId]);

  return {
    cancelActiveQuestionTimer,
    effectiveAutoApproveTimeoutMs:
      activeQuestion && questionTimerCancelledForId === activeQuestion.id
        ? undefined
        : activeQuestion?.autoApproveTimeoutMs,
  };
}
