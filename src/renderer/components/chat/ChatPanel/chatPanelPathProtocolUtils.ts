export function applyDesktopRemotionQueryParams(
  url: URL,
  desktopVersion?: string | null,
): void {
  url.searchParams.set('desktop_remotion', '1');
  url.searchParams.set('desktop_assembly', '1');

  const normalizedVersion = desktopVersion?.trim();
  if (!normalizedVersion) {
    return;
  }
  url.searchParams.set('desktop_version', normalizedVersion);
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
