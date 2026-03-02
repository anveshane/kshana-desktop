import fs from 'fs';
import path from 'path';

type LoggerLike = {
  info?: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
};

export interface EsbuildBinaryBootstrapOptions {
  isPackaged: boolean;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  readdirSync?: (dirPath: string) => fs.Dirent[];
  logger?: LoggerLike;
}

export interface EsbuildBinaryBootstrapResult {
  applied: boolean;
  reason:
    | 'not_packaged'
    | 'missing_resources_path'
    | 'already_configured'
    | 'resolved'
    | 'binary_not_found';
  binaryPath?: string;
  attemptedPaths: string[];
}

function getEsbuildBinaryFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'esbuild.exe' : 'esbuild';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

interface ResolveOptions {
  resourcesPath: string;
  platform: NodeJS.Platform;
  arch: string;
  existsSync: (filePath: string) => boolean;
  readdirSync: (dirPath: string) => fs.Dirent[];
}

function resolvePackagedEsbuildBinaryPath(
  options: ResolveOptions,
): { binaryPath?: string; attemptedPaths: string[] } {
  const {
    resourcesPath,
    platform,
    arch,
    existsSync,
    readdirSync,
  } = options;
  const attemptedPaths: string[] = [];
  const nodeModulesRoot = path.join(
    resourcesPath,
    'app.asar.unpacked',
    'node_modules',
  );
  const binaryFileName = getEsbuildBinaryFileName(platform);
  const expectedPath = path.join(
    nodeModulesRoot,
    '@esbuild',
    `${platform}-${arch}`,
    'bin',
    binaryFileName,
  );
  attemptedPaths.push(expectedPath);

  if (existsSync(expectedPath)) {
    return { binaryPath: expectedPath, attemptedPaths };
  }

  const esbuildScopeDir = path.join(nodeModulesRoot, '@esbuild');
  if (!existsSync(esbuildScopeDir)) {
    return { attemptedPaths };
  }

  let entries: fs.Dirent[] = [];
  try {
    entries = readdirSync(esbuildScopeDir);
  } catch {
    return { attemptedPaths };
  }

  const fallbackCandidates = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${platform}-`))
    .map((entry) =>
      path.join(esbuildScopeDir, entry.name, 'bin', binaryFileName),
    );

  for (const candidate of fallbackCandidates) {
    attemptedPaths.push(candidate);
    if (existsSync(candidate)) {
      return { binaryPath: candidate, attemptedPaths };
    }
  }

  return { attemptedPaths };
}

export function bootstrapPackagedEsbuildBinaryPath(
  options: EsbuildBinaryBootstrapOptions,
): EsbuildBinaryBootstrapResult {
  const {
    isPackaged,
    resourcesPath,
    platform = process.platform,
    arch = process.arch,
    env = process.env,
    existsSync = fs.existsSync,
    readdirSync = (dirPath: string) =>
      fs.readdirSync(dirPath, { withFileTypes: true }) as fs.Dirent[],
    logger,
  } = options;

  if (!isPackaged) {
    return {
      applied: false,
      reason: 'not_packaged',
      attemptedPaths: [],
    };
  }

  if (!resourcesPath) {
    return {
      applied: false,
      reason: 'missing_resources_path',
      attemptedPaths: [],
    };
  }

  const configuredBinaryPath = env['ESBUILD_BINARY_PATH'];
  if (configuredBinaryPath && existsSync(configuredBinaryPath)) {
    return {
      applied: false,
      reason: 'already_configured',
      binaryPath: configuredBinaryPath,
      attemptedPaths: [configuredBinaryPath],
    };
  }

  const resolved = resolvePackagedEsbuildBinaryPath({
    resourcesPath,
    platform,
    arch,
    existsSync,
    readdirSync,
  });

  if (!resolved.binaryPath) {
    const attemptedPaths = uniqueSorted(resolved.attemptedPaths);
    logger?.warn?.(
      '[EsbuildBinaryPath] Could not resolve packaged esbuild binary. Tried:\n%s',
      attemptedPaths.map((candidate) => `  - ${candidate}`).join('\n'),
    );
    return {
      applied: false,
      reason: 'binary_not_found',
      attemptedPaths,
    };
  }

  env['ESBUILD_BINARY_PATH'] = resolved.binaryPath;
  logger?.info?.(
    '[EsbuildBinaryPath] Using packaged esbuild binary at %s',
    resolved.binaryPath,
  );

  return {
    applied: true,
    reason: 'resolved',
    binaryPath: resolved.binaryPath,
    attemptedPaths: uniqueSorted(resolved.attemptedPaths),
  };
}
