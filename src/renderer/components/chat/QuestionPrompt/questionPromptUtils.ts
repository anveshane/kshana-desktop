import type { ChatQuestionOption } from '../../../types/chat';

export function normalizeAutoApproveSeconds(
  autoApproveTimeoutMs?: number,
): number | null {
  return typeof autoApproveTimeoutMs === 'number' &&
    Number.isFinite(autoApproveTimeoutMs)
    ? Math.ceil(autoApproveTimeoutMs / 1000)
    : null;
}

export function buildDisplayOptions(
  options: ChatQuestionOption[] | undefined,
  type: 'text' | 'confirm' | 'select',
  isConfirmation: boolean,
): ChatQuestionOption[] {
  if (options && options.length > 0) {
    return options;
  }

  if (type === 'confirm' || isConfirmation) {
    return [{ label: 'Yes' }, { label: 'No' }];
  }

  return [];
}

export function resolveAutoApproveOption(
  options: ChatQuestionOption[] | undefined,
  type: 'text' | 'confirm' | 'select',
  isConfirmation: boolean,
  defaultOption?: string,
): string | undefined {
  if (defaultOption) {
    return defaultOption;
  }

  const displayOptions = buildDisplayOptions(options, type, isConfirmation);
  const firstOption = displayOptions[0]?.label?.trim();
  if (!firstOption) {
    return undefined;
  }

  if (firstOption.toLowerCase() === 'other') {
    return undefined;
  }

  return firstOption;
}
