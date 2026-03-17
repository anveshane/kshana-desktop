import type { ChatQuestionOption } from '../../../types/chat';
import { resolveAutoApproveOption } from '../QuestionPrompt/questionPromptUtils';

interface ImmediateAutoResponseArgs {
  options?: ChatQuestionOption[];
  questionType: 'text' | 'confirm' | 'select';
  isConfirmation: boolean;
  autoApproveTimeoutMs?: number;
  defaultOption?: string;
}

export function getImmediateAutoQuestionResponse({
  options,
  questionType,
  isConfirmation,
  autoApproveTimeoutMs,
  defaultOption,
}: ImmediateAutoResponseArgs): string | undefined {
  if (autoApproveTimeoutMs !== 0) {
    return undefined;
  }

  return resolveAutoApproveOption(
    options,
    questionType,
    isConfirmation,
    defaultOption,
  );
}
