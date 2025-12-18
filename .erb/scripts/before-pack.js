const fs = require('fs');
const path = require('path');

/**
 * Electron-builder beforePack hook
 * Verifies that kshana-ink resource is prepared before packaging
 */

module.exports = async function beforePack(context) {
  // Get project root directory
  let projectRoot;
  
  try {
    if (context.packager && context.packager.projectDir) {
      projectRoot = context.packager.projectDir;
    } else {
      projectRoot = process.cwd();
    }
  } catch (error) {
    console.error('[beforePack] Error determining project root:', error);
    throw new Error(`[beforePack] Could not determine project root: ${error.message}`);
  }

  console.log(`[beforePack] Using project root: ${projectRoot}`);

  // Verify resources/kshana-ink exists (prepared by prepare-backend-resource.ts)
  const resourcesPath = path.join(projectRoot, 'resources', 'kshana-ink');
  const serverIndexPath = path.join(resourcesPath, 'dist', 'server', 'index.js');
  const llmIndexPath = path.join(resourcesPath, 'dist', 'core', 'llm', 'index.js');

  console.log('[beforePack] Verifying kshana-ink resource...');
  console.log(`  Resource path: ${resourcesPath}`);

  if (!fs.existsSync(resourcesPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink resource not found at: ${resourcesPath}`);
    console.error('  Please ensure prepare-backend-resource.ts script ran successfully');
    throw new Error('kshana-ink resource not found - cannot package app');
  }

  if (!fs.existsSync(serverIndexPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink server module not found at: ${serverIndexPath}`);
    throw new Error('kshana-ink server module missing - cannot package app');
  }

  if (!fs.existsSync(llmIndexPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink llm module not found at: ${llmIndexPath}`);
    throw new Error('kshana-ink llm module missing - cannot package app');
  }

  console.log('[beforePack] ✓ kshana-ink resource verified and ready for packaging');
};

