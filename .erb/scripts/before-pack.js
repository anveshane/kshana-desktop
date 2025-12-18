const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Electron-builder beforePack hook
 * Ensures kshana-ink is copied to release/app/node_modules before packaging
 */

module.exports = async function beforePack(context) {
  // Get app directory from context.packager
  // beforePack context has: { packager, electronPlatformName, arch, ... }
  // packager.projectDir points to the project root
  let appPath;
  
  try {
    if (context.packager && context.packager.projectDir) {
      // Use projectDir and append release/app (standard electron-builder structure)
      appPath = path.join(context.packager.projectDir, 'release', 'app');
    } else {
      // Fallback: use current working directory
      appPath = path.resolve(process.cwd(), 'release', 'app');
    }

    // Verify appPath is valid
    if (!appPath || typeof appPath !== 'string') {
      throw new Error(`Invalid appPath: ${appPath}`);
    }
  } catch (error) {
    console.error('[beforePack] Error determining app directory:', error);
    console.error('[beforePack] Context keys:', Object.keys(context || {}));
    if (context.packager) {
      console.error('[beforePack] Packager keys:', Object.keys(context.packager));
      console.error('[beforePack] Packager projectDir:', context.packager.projectDir);
    }
    console.error('[beforePack] Current working directory:', process.cwd());
    throw new Error(`[beforePack] Could not determine app directory: ${error.message}`);
  }

  console.log(`[beforePack] Using app directory: ${appPath}`);

  const nodeModulesPath = path.join(appPath, 'node_modules');
  const kshanaInkTargetPath = path.join(nodeModulesPath, 'kshana-ink');
  const distPath = path.join(kshanaInkTargetPath, 'dist');
  const serverIndexPath = path.join(distPath, 'server', 'index.js');

  console.log('[beforePack] Checking kshana-ink...');
  console.log(`  App directory: ${appPath}`);
  console.log(`  Target: ${kshanaInkTargetPath}`);

  // Check if kshana-ink already exists
  if (fs.existsSync(serverIndexPath)) {
    console.log('[beforePack] ✓ kshana-ink already exists in node_modules');
    return;
  }

  // Try to find kshana-ink source
  const possibleSources = [
    path.resolve(appPath, '../../node_modules/kshana-ink'),
    path.resolve(appPath, '../../../node_modules/kshana-ink'),
    path.resolve(appPath, '../../kshana-ink'),
    path.resolve(process.cwd(), 'node_modules/kshana-ink'),
    path.resolve(process.cwd(), '../kshana-ink'),
  ];

  let foundSource = null;
  for (const source of possibleSources) {
    if (fs.existsSync(source) && fs.existsSync(path.join(source, 'dist', 'server', 'index.js'))) {
      foundSource = source;
      console.log(`[beforePack] Found kshana-ink source at: ${foundSource}`);
      break;
    }
  }

  if (!foundSource) {
    console.error('[beforePack] ✗ ERROR: kshana-ink source not found!');
    console.error('  Checked locations:');
    possibleSources.forEach(src => {
      const exists = fs.existsSync(src);
      console.error(`    ${exists ? '✓' : '✗'} ${src}`);
    });
    throw new Error('kshana-ink not found - cannot package app');
  }

  // Ensure node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
    fs.mkdirSync(nodeModulesPath, { recursive: true });
  }

  // Remove existing kshana-ink if it exists (but is incomplete)
  if (fs.existsSync(kshanaInkTargetPath)) {
    console.log('[beforePack] Removing incomplete kshana-ink...');
    fs.rmSync(kshanaInkTargetPath, { recursive: true, force: true });
  }

  // Copy kshana-ink
  console.log(`[beforePack] Copying kshana-ink from ${foundSource} to ${kshanaInkTargetPath}...`);
  try {
    execSync(`cp -RL "${foundSource}" "${kshanaInkTargetPath}"`, {
      stdio: 'inherit',
    });
    console.log('[beforePack] ✓ kshana-ink copied successfully');
  } catch (error) {
    console.error(`[beforePack] ✗ ERROR: Failed to copy kshana-ink: ${error}`);
    throw error;
  }

  // Verify copy succeeded
  if (!fs.existsSync(serverIndexPath)) {
    console.error(`[beforePack] ✗ ERROR: Copy verification failed - ${serverIndexPath} not found`);
    throw new Error('kshana-ink copy verification failed');
  }

  console.log('[beforePack] ✓ kshana-ink verified and ready for packaging');
};

