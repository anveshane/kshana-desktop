export const REQUIRED_FILE_PATH_PROTOCOL_VERSION = 2;

export function extractFilePathProtocolVersion(
  statusData: Record<string, unknown>,
): number | null {
  const capabilities = statusData.capabilities;
  if (!capabilities || typeof capabilities !== 'object') {
    return null;
  }

  const rawVersion = (capabilities as Record<string, unknown>)
    .filePathProtocolVersion;

  if (typeof rawVersion === 'number' && Number.isFinite(rawVersion)) {
    return rawVersion;
  }

  if (typeof rawVersion === 'string') {
    const parsed = Number(rawVersion);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function shouldShowFilePathProtocolWarning(
  protocolVersion: number | null,
  sessionId: string | null,
  warnedSessionIds: Set<string>,
  warnedWithoutSession: boolean,
): { shouldWarn: boolean; warnedWithoutSession: boolean } {
  if (
    protocolVersion !== null &&
    protocolVersion >= REQUIRED_FILE_PATH_PROTOCOL_VERSION
  ) {
    return { shouldWarn: false, warnedWithoutSession };
  }

  if (sessionId) {
    if (warnedSessionIds.has(sessionId)) {
      return { shouldWarn: false, warnedWithoutSession };
    }
    warnedSessionIds.add(sessionId);
    if (warnedWithoutSession) {
      return { shouldWarn: false, warnedWithoutSession };
    }
    return { shouldWarn: true, warnedWithoutSession };
  }

  if (warnedWithoutSession) {
    return { shouldWarn: false, warnedWithoutSession };
  }

  return { shouldWarn: true, warnedWithoutSession: true };
}
