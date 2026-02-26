import path from 'path';

export type ProjectFileOpGuardErrorCode =
  | 'INVALID_FILE_PATH'
  | 'PROJECT_ROOT_NOT_SET'
  | 'PROJECT_PATH_OUTSIDE_ROOT';

export class ProjectFileOpGuardError extends Error {
  code: ProjectFileOpGuardErrorCode;

  constructor(code: ProjectFileOpGuardErrorCode, message: string) {
    super(message);
    this.name = 'ProjectFileOpGuardError';
    this.code = code;
  }
}

function stripFileProtocol(rawPath: string): string {
  if (!rawPath.startsWith('file://')) {
    return rawPath;
  }

  let cleanPath = rawPath.replace(/^file:\/\//i, '');

  if (cleanPath.startsWith('localhost/')) {
    cleanPath = cleanPath.slice('localhost'.length);
  }

  const queryIndex = cleanPath.indexOf('?');
  const hashIndex = cleanPath.indexOf('#');
  const cutIndexCandidates = [queryIndex, hashIndex].filter((index) => index >= 0);
  if (cutIndexCandidates.length > 0) {
    cleanPath = cleanPath.slice(0, Math.min(...cutIndexCandidates));
  }

  try {
    return decodeURIComponent(cleanPath);
  } catch {
    return cleanPath;
  }
}

/**
 * Normalize incoming file operation paths from remote backend messages.
 * Keeps relative paths relative; absolute paths remain absolute.
 */
export function normalizeIncomingPath(
  rawPath: string,
  platform: NodeJS.Platform = process.platform,
  _cwd: string = process.cwd(),
): string {
  if (typeof rawPath !== 'string') {
    throw new ProjectFileOpGuardError(
      'INVALID_FILE_PATH',
      'Incoming path must be a string.',
    );
  }

  const trimmed = rawPath.trim();
  if (!trimmed) {
    throw new ProjectFileOpGuardError(
      'INVALID_FILE_PATH',
      'Incoming path cannot be empty.',
    );
  }

  let cleaned = stripFileProtocol(trimmed);

  if (platform === 'win32') {
    cleaned = cleaned.replace(/\//g, '\\');
    if (/^\\[A-Za-z]:\\/.test(cleaned)) {
      cleaned = cleaned.slice(1);
    }
    const normalized = path.win32.normalize(cleaned);
    if (!normalized || normalized === '.') {
      throw new ProjectFileOpGuardError(
        'INVALID_FILE_PATH',
        `Invalid normalized path: "${rawPath}"`,
      );
    }
    return normalized;
  }

  cleaned = cleaned.replace(/\\/g, '/');
  if (cleaned.startsWith('//')) {
    cleaned = `/${cleaned.replace(/^\/+/, '')}`;
  }
  if (/^[A-Za-z]:\//.test(cleaned)) {
    // Windows absolute path serialized to POSIX host.
    cleaned = `/${cleaned}`;
  }

  const normalized = path.posix.normalize(cleaned);
  if (!normalized || normalized === '.') {
    throw new ProjectFileOpGuardError(
      'INVALID_FILE_PATH',
      `Invalid normalized path: "${rawPath}"`,
    );
  }
  return normalized;
}

/**
 * Resolve path against active project root (if needed) and enforce containment.
 */
export function resolveAndValidateProjectPath(
  normalizedPath: string,
  activeProjectRoot: string | null | undefined,
): string {
  if (!activeProjectRoot || !activeProjectRoot.trim()) {
    throw new ProjectFileOpGuardError(
      'PROJECT_ROOT_NOT_SET',
      'No active project root is available for file operation validation.',
    );
  }

  const resolvedRoot = path.resolve(activeProjectRoot);
  const resolvedPath = path.isAbsolute(normalizedPath)
    ? path.normalize(normalizedPath)
    : path.resolve(resolvedRoot, normalizedPath);

  const relative = path.relative(resolvedRoot, resolvedPath);
  const isInsideRoot =
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative));

  if (isInsideRoot) {
    return resolvedPath;
  }

  throw new ProjectFileOpGuardError(
    'PROJECT_PATH_OUTSIDE_ROOT',
    `Resolved path "${resolvedPath}" is outside active project root "${resolvedRoot}".`,
  );
}
