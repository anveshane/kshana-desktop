/**
 * Resolves the path to remotion-infographics directory.
 * Used by RemotionManager for dev vs packaged environments.
 */
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import log from 'electron-log';

const REMOTION_VERSION = '2.0.0';

export function getRemotionInfographicsDir(): string {
  if (app.isPackaged) {
    return getProductionRemotionDir();
  }
  return getDevelopmentRemotionDir();
}

function getProductionRemotionDir(): string {
  const userDataPath = app.getPath('userData');
  const userRemotionDir = path.join(userDataPath, 'remotion-infographics');
  const versionFile = path.join(userRemotionDir, '.version');

  let needsInit = false;

  if (!fs.existsSync(userRemotionDir)) {
    needsInit = true;
    log.info('[RemotionPath] User remotion directory not found - first launch');
  } else if (!fs.existsSync(path.join(userRemotionDir, 'package.json'))) {
    needsInit = true;
    log.warn('[RemotionPath] Incomplete remotion directory - reinitializing');
  } else if (fs.existsSync(versionFile)) {
    const installedVersion = fs.readFileSync(versionFile, 'utf-8').trim();
    if (installedVersion !== REMOTION_VERSION) {
      needsInit = true;
      log.info(
        `[RemotionPath] Remotion template outdated (${installedVersion} -> ${REMOTION_VERSION}) - updating`,
      );
    }
  } else {
    needsInit = true;
    log.info('[RemotionPath] No version file - reinitializing');
  }

  if (needsInit) {
    initializeRemotionInUserData(userRemotionDir);
  }

  ensureRuntimeNodeModulesLink(userRemotionDir);

  return userRemotionDir;
}

function getDevelopmentRemotionDir(): string {
  const cwdRemotionPath = path.resolve(process.cwd(), '..', 'kshana-ink', 'remotion-infographics');
  const devPaths = [
    cwdRemotionPath,
    path.join(__dirname, '../../node_modules/kshana-ink/remotion-infographics'),
    path.join(__dirname, '../../kshana-ink/remotion-infographics'),
    path.join(__dirname, '../../../remotion-infographics'),
  ];

  for (const devPath of devPaths) {
    if (fs.existsSync(devPath) && fs.existsSync(path.join(devPath, 'package.json'))) {
      return path.resolve(devPath);
    }
  }

  throw new Error(
    'remotion-infographics not found in development. Ensure kshana-ink is installed and remotion-infographics exists.',
  );
}

function initializeRemotionInUserData(targetDir: string): void {
  log.info('[RemotionPath] Initializing remotion-infographics in user data');
  log.info('[RemotionPath] Target:', targetDir);

  try {
    const templateDir = getBundledRemotionTemplate();
    log.info('[RemotionPath] Template source:', templateDir);

    if (fs.existsSync(targetDir)) {
      log.info('[RemotionPath] Removing old version...');
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    log.info('[RemotionPath] Copying template...');
    copyRemotionTemplate(templateDir, targetDir);

    fs.writeFileSync(path.join(targetDir, '.version'), REMOTION_VERSION, 'utf-8');
    log.info('[RemotionPath] ✓ Remotion template initialized successfully');
  } catch (error) {
    log.error('[RemotionPath] Failed to initialize:', error);
    throw new Error(
      `Failed to initialize remotion-infographics: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getBundledRemotionTemplate(): string {
  const paths = [
    path.join(
      process.resourcesPath,
      'assets',
      'remotion-infographics-template',
    ),
    path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'kshana-ink',
      'remotion-infographics',
    ),
    path.join(process.resourcesPath, 'remotion-infographics'),
    path.join(process.resourcesPath, 'assets', 'remotion-infographics'),
  ];

  for (const templatePath of paths) {
    if (fs.existsSync(templatePath) && fs.existsSync(path.join(templatePath, 'package.json'))) {
      return templatePath;
    }
  }

  throw new Error(
    'Remotion template not found in app bundle. Paths checked:\n' +
      paths.map((p) => `  - ${p}`).join('\n'),
  );
}

function resolveRuntimeNodeModulesDir(): string | null {
  if (app.isPackaged) {
    const packagedCandidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
      path.join(process.resourcesPath, 'node_modules'),
      path.join(process.resourcesPath, 'app.asar', 'node_modules'),
    ];
    for (const candidate of packagedCandidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  const devCandidates = [
    path.resolve(process.cwd(), 'node_modules'),
    path.resolve(process.cwd(), '..', 'kshana-desktop', 'node_modules'),
  ];
  for (const candidate of devCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function ensureRuntimeNodeModulesLink(remotionDir: string): void {
  const targetNodeModules = path.join(remotionDir, 'node_modules');
  if (fs.existsSync(targetNodeModules)) {
    return;
  }

  const runtimeNodeModules = resolveRuntimeNodeModulesDir();
  if (!runtimeNodeModules) {
    log.warn('[RemotionPath] Could not find runtime node_modules to link');
    return;
  }

  try {
    fs.symlinkSync(
      runtimeNodeModules,
      targetNodeModules,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    log.info(
      `[RemotionPath] Linked remotion node_modules -> ${runtimeNodeModules}`,
    );
  } catch (error) {
    log.warn('[RemotionPath] Failed to create node_modules link:', error);
  }
}

function copyRemotionTemplate(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') {
        continue;
      }
      if (entry.name === 'build') {
        fs.mkdirSync(destPath, { recursive: true });
        continue;
      }
      copyRemotionTemplate(srcPath, destPath);
      continue;
    }

    fs.copyFileSync(srcPath, destPath);
  }

  fs.mkdirSync(path.join(dest, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'build'), { recursive: true });
}
