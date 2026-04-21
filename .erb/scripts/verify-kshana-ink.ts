import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import webpackPaths from '../configs/webpack.paths';

interface VersionMetadata {
  packageVersion?: string;
  gitBranch?: string;
  gitCommit?: string;
  commitDate?: string;
}

function resolveKshanaInkPath(): string {
  const configured = process.env['KSHANA_INK_PATH'];
  if (configured && configured.trim()) {
    return path.resolve(configured);
  }

  return path.resolve(webpackPaths.rootPath, '../kshana-core');
}

function runGit(repoPath: string, command: string): string | undefined {
  try {
    const value = execSync(command, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();

    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function verifyKshanaInk(): void {
  const kshanaInkPath = resolveKshanaInkPath();
  const packageJsonPath = path.join(kshanaInkPath, 'package.json');
  const serverCliPath = path.join(kshanaInkPath, 'dist', 'server', 'cli.cjs');
  const releaseAppPath = webpackPaths.appPath;
  const metadataPath = path.join(releaseAppPath, '.kshana-core-version.json');

  if (!fs.existsSync(kshanaInkPath)) {
    throw new Error(`kshana-core repo not found at ${kshanaInkPath}`);
  }

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`kshana-core package.json not found at ${packageJsonPath}`);
  }

  if (!fs.existsSync(serverCliPath)) {
    throw new Error(
      `kshana-core build output missing at ${serverCliPath}. Run a build in ../kshana-core first.`,
    );
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf-8'),
  ) as { version?: string };

  const metadata: VersionMetadata = {
    packageVersion: packageJson.version,
    gitBranch: runGit(kshanaInkPath, 'git rev-parse --abbrev-ref HEAD'),
    gitCommit: runGit(kshanaInkPath, 'git rev-parse HEAD'),
    commitDate: runGit(kshanaInkPath, 'git log -1 --format=%cI'),
  };

  fs.mkdirSync(releaseAppPath, { recursive: true });
  fs.writeFileSync(`${metadataPath}`, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`✓ Verified kshana-core at ${kshanaInkPath}`);
  console.log(`✓ Wrote bundled version metadata to ${metadataPath}`);
}

try {
  verifyKshanaInk();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Failed to verify kshana-core',
  );
  process.exit(1);
}
