import type { AccountInfo } from './settingsTypes';

export const HOSTED_COMFY_PLAN_LABEL = 'Standard, Creator, or Pro';

const HOSTED_COMFY_PLAN_IDS = new Set(['standard_20', 'creator_35', 'pro_100']);

export function canUseHostedComfy(
  account: Pick<AccountInfo, 'planId' | 'subscriptionStatus'> | null | undefined,
): boolean {
  return (
    account?.subscriptionStatus === 'active' &&
    typeof account.planId === 'string' &&
    HOSTED_COMFY_PLAN_IDS.has(account.planId)
  );
}

export function hostedComfyUnavailableReason(
  account: Pick<AccountInfo, 'planId' | 'subscriptionStatus'> | null | undefined,
): string {
  if (!account) return 'Sign in to Dhee Cloud to enable hosted ComfyUI';
  if (account.subscriptionStatus !== 'active') {
    return 'An active Standard, Creator, or Pro plan is required for hosted ComfyUI';
  }
  return 'Hosted ComfyUI is available on Standard, Creator, and Pro plans';
}
