import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import webpackPaths from '../configs/webpack.paths';

interface PackResult {
  filename: string;
}

function getNpmEnv(): NodeJS.ProcessEnv {
  const cachePath = path.join(webpackPaths.rootPath, '.npm-cache');
  fs.mkdirSync(cachePath, { recursive: true });

  return {
    ...process.env,
    npm_config_cache: cachePath,
  };
}

function runNpm(
  args: string[],
  options: {
    cwd: string;
    stdio: 'inherit' | ['ignore', 'pipe', 'inherit'];
  },
): Buffer {
  const npmExecPath = process.env['npm_execpath'];
  if (npmExecPath && npmExecPath.trim().length > 0) {
    return execFileSync(process.execPath, [npmExecPath, ...args], {
      cwd: options.cwd,
      env: getNpmEnv(),
      stdio: options.stdio,
    });
  }

  return execFileSync('npm', args, {
    cwd: options.cwd,
    env: getNpmEnv(),
    stdio: options.stdio,
  });
}

function withLockfileDisabled<T>(callback: () => T): T {
  const lockfilePath = path.join(webpackPaths.appPath, 'package-lock.json');
  const backupLockfilePath = path.join(
    webpackPaths.appPath,
    '.package-lock.packaging-backup.json',
  );

  const hasExistingLockfile = fs.existsSync(lockfilePath);
  if (hasExistingLockfile) {
    fs.rmSync(backupLockfilePath, { force: true });
    fs.renameSync(lockfilePath, backupLockfilePath);
  }

  try {
    return callback();
  } finally {
    fs.rmSync(lockfilePath, { force: true });
    if (hasExistingLockfile && fs.existsSync(backupLockfilePath)) {
      fs.renameSync(backupLockfilePath, lockfilePath);
    }
  }
}

function resolveKshanaInkPath(): string {
  const configured = process.env['KSHANA_INK_PATH'];
  if (configured && configured.trim()) {
    return path.resolve(configured);
  }

  return path.resolve(webpackPaths.rootPath, '../kshana-ink');
}

function syncReleaseAppPackage(mainPackagePath: string, tarballRelativePath: string) {
  const mainPackage = JSON.parse(
    fs.readFileSync(mainPackagePath, 'utf-8'),
  ) as {
    name?: string;
    version?: string;
    description?: string;
    dependencies?: Record<string, string>;
  };

  const appPackage = {
    name: mainPackage.name || 'kshana-desktop',
    version: mainPackage.version || '1.0.0',
    description: mainPackage.description || '',
    main: './dist/main/main.js',
    dependencies: {
      ...(mainPackage.dependencies || {}),
      'kshana-ink': `file:${tarballRelativePath}`,
    },
  };

  fs.mkdirSync(webpackPaths.appPath, { recursive: true });
  fs.writeFileSync(
    webpackPaths.appPackagePath,
    `${JSON.stringify(appPackage, null, 2)}\n`,
  );
}

function packKshanaInk(kshanaInkPath: string): string {
  const vendorPath = path.join(webpackPaths.appPath, 'vendor');
  fs.rmSync(vendorPath, { recursive: true, force: true });
  fs.mkdirSync(vendorPath, { recursive: true });

  const rawOutput = runNpm(
    ['pack', '--json', '--pack-destination', vendorPath],
    {
      cwd: kshanaInkPath,
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  )
    .toString()
    .trim();

  const [result] = JSON.parse(rawOutput) as PackResult[];
  if (!result?.filename) {
    throw new Error('npm pack did not return a tarball filename for kshana-ink');
  }

  return path.join(vendorPath, result.filename);
}

function installAppDeps(): void {
  const kshanaInkPath = resolveKshanaInkPath();
  const mainPackagePath = path.join(webpackPaths.rootPath, 'package.json');

  if (!fs.existsSync(mainPackagePath)) {
    throw new Error(`Main package.json not found at ${mainPackagePath}`);
  }

  if (!fs.existsSync(kshanaInkPath)) {
    throw new Error(`kshana-ink repo not found at ${kshanaInkPath}`);
  }

  const tarballPath = packKshanaInk(kshanaInkPath);
  const tarballRelativePath = path.relative(webpackPaths.appPath, tarballPath);
  syncReleaseAppPackage(mainPackagePath, tarballRelativePath);

  fs.rmSync(webpackPaths.appNodeModulesPath, { recursive: true, force: true });

  withLockfileDisabled(() => {
    runNpm(['install', '--omit=dev', '--no-package-lock'], {
      cwd: webpackPaths.appPath,
      stdio: 'inherit',
    });
  });

  const installedServerCliPath = path.join(
    webpackPaths.appNodeModulesPath,
    'kshana-ink',
    'dist',
    'server',
    'cli.cjs',
  );

  if (!fs.existsSync(installedServerCliPath)) {
    throw new Error(
      `Installed kshana-ink server entry not found at ${installedServerCliPath}`,
    );
  }

  console.log(`✓ Installed app dependencies with bundled kshana-ink`);
  console.log(`✓ Verified bundled server entry at ${installedServerCliPath}`);
}

try {
  installAppDeps();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Failed to install app dependencies',
  );
  process.exit(1);
}
