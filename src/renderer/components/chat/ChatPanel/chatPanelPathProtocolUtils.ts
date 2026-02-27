export const REQUIRED_FILE_PATH_PROTOCOL_VERSION = 3;
export const REQUIRED_FILE_PATH_TRANSPORT = 'relative_posix';

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

export function extractFilePathTransport(
  statusData: Record<string, unknown>,
): string | null {
  const capabilities = statusData.capabilities;
  if (!capabilities || typeof capabilities !== 'object') {
    return null;
  }

  const transport = (capabilities as Record<string, unknown>).filePathTransport;
  if (typeof transport === 'string' && transport.trim()) {
    return transport;
  }

  return null;
}

export function isFilePathProtocolCompatible(
  protocolVersion: number | null,
  transport: string | null,
): boolean {
  return (
    protocolVersion !== null &&
    protocolVersion >= REQUIRED_FILE_PATH_PROTOCOL_VERSION &&
    transport === REQUIRED_FILE_PATH_TRANSPORT
  );
}

export function extractIncomingFileOpPath(
  fileOpData: Record<string, unknown>,
): string {
  const relativePath = fileOpData.relativePath;
  if (typeof relativePath === 'string' && relativePath.trim()) {
    return relativePath.trim();
  }

  const legacyPath = fileOpData.path;
  if (typeof legacyPath === 'string' && legacyPath.trim()) {
    return legacyPath.trim();
  }

  return '';
}

export function isAbsoluteWirePath(filePath: string): boolean {
  if (!filePath) return false;
  return (
    filePath.startsWith('/') ||
    filePath.startsWith('\\') ||
    /^[A-Za-z]:[\\/]/.test(filePath)
  );
}

export function shouldShowFilePathProtocolWarning(
  isCompatible: boolean,
  sessionId: string | null,
  warnedSessionIds: Set<string>,
  warnedWithoutSession: boolean,
): { shouldWarn: boolean; warnedWithoutSession: boolean } {
  if (isCompatible) {
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
