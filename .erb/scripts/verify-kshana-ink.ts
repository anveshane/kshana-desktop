import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

const { appPath } = webpackPaths;

interface VersionInfo {
  branch: string;
  commit: string;
  date: string;
  sourcePath: string;
}

/**
 * Get git branch name for a repository
 */
function getGitBranch(repoPath: string): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
    return branch;
  } catch (error) {
    throw new Error(`Failed to get git branch for ${repoPath}: ${(error as Error).message}`);
  }
}

/**
 * Get git commit hash for a repository
 */
function getGitCommit(repoPath: string): string {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
    return commit;
  } catch (error) {
    throw new Error(`Failed to get git commit for ${repoPath}: ${(error as Error).message}`);
  }
}

/**
 * Get git commit date for a repository
 */
function getGitCommitDate(repoPath: string): string {
  try {
    const date = execSync('git log -1 --format=%cI', {
      cwd: repoPath,
      encoding: 'utf-8',
    }).trim();
    return date;
  } catch (error) {
    throw new Error(`Failed to get git commit date for ${repoPath}: ${(error as Error).message}`);
  }
}

/**
 * Verify kshana-ink is built and ready for packaging
 */
function verifyKshanaInk(sourcePath: string): void {
  const absoluteSourcePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(path.dirname(__dirname), '..', '..', sourcePath);

  console.log(`Verifying kshana-ink at: ${absoluteSourcePath}`);

  // Check if kshana-ink directory exists
  if (!fs.existsSync(absoluteSourcePath)) {
    throw new Error(
      `kshana-ink not found at ${absoluteSourcePath}. ` +
        'Please ensure kshana-ink is cloned and available at the expected location.',
    );
  }

  // Check if it's a git repository
  const gitPath = path.join(absoluteSourcePath, '.git');
  if (!fs.existsSync(gitPath)) {
    throw new Error(
      `kshana-ink at ${absoluteSourcePath} is not a git repository. ` +
        'Please ensure you are using a git clone of kshana-ink.',
    );
  }

  // Verify dist/server/index.js exists
  const serverIndexPath = path.join(absoluteSourcePath, 'dist', 'server', 'index.js');
  if (!fs.existsSync(serverIndexPath)) {
    throw new Error(
      `kshana-ink is not built. Missing: ${serverIndexPath}\n` +
        'Please run "pnpm build" (or "npm run build") in the kshana-ink directory.',
    );
  }

  // Verify dist/core/llm/index.js exists
  const llmIndexPath = path.join(absoluteSourcePath, 'dist', 'core', 'llm', 'index.js');
  if (!fs.existsSync(llmIndexPath)) {
    throw new Error(
      `kshana-ink is not built. Missing: ${llmIndexPath}\n` +
        'Please run "pnpm build" (or "npm run build") in the kshana-ink directory.',
    );
  }

  // Verify dist/prompts directory exists
  const promptsPath = path.join(absoluteSourcePath, 'dist', 'prompts');
  if (!fs.existsSync(promptsPath)) {
    throw new Error(
      `kshana-ink prompts not found. Missing: ${promptsPath}\n` +
        'Please run "pnpm build" (or "npm run build") in the kshana-ink directory.',
    );
  }

  // Verify package.json exists
  const packageJsonPath = path.join(absoluteSourcePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`kshana-ink package.json not found at ${packageJsonPath}`);
  }

  console.log('✓ kshana-ink verification passed');
  console.log(`  - Server module: ${serverIndexPath}`);
  console.log(`  - LLM module: ${llmIndexPath}`);
  console.log(`  - Prompts: ${promptsPath}`);
}

/**
 * Record version information to .kshana-ink-version.json
 */
function recordVersionInfo(sourcePath: string): void {
  const absoluteSourcePath = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.resolve(path.dirname(__dirname), '..', '..', sourcePath);

  try {
    const branch = getGitBranch(absoluteSourcePath);
    const commit = getGitCommit(absoluteSourcePath);
    const date = getGitCommitDate(absoluteSourcePath);

    const versionInfo: VersionInfo = {
      branch,
      commit,
      date,
      sourcePath,
    };

    // Ensure release/app directory exists
    if (!fs.existsSync(appPath)) {
      fs.mkdirSync(appPath, { recursive: true });
    }

    const versionFilePath = path.join(appPath, '.kshana-ink-version.json');
    fs.writeFileSync(versionFilePath, JSON.stringify(versionInfo, null, 2) + '\n');

    console.log('✓ Version information recorded:');
    console.log(`  - Branch: ${branch}`);
    console.log(`  - Commit: ${commit.substring(0, 8)}...`);
    console.log(`  - Date: ${date}`);
    console.log(`  - Saved to: ${versionFilePath}`);
  } catch (error) {
    console.warn(`Warning: Could not record version info: ${(error as Error).message}`);
    // Don't fail the build if version recording fails
  }
}

/**
 * Main verification function
 */
function main() {
  // Default source path relative to kshana-desktop root
  const defaultSourcePath = '../kshana-ink';
  const sourcePath = process.argv[2] || defaultSourcePath;

  try {
    verifyKshanaInk(sourcePath);
    recordVersionInfo(sourcePath);
    console.log('\n✓ kshana-ink verification complete - ready for packaging');
  } catch (error) {
    console.error('\n❌ kshana-ink verification failed:');
    console.error((error as Error).message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verifyKshanaInk, recordVersionInfo };

