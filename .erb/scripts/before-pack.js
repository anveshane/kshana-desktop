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

  // Verify resources/kshana-ink exists (bundled by bundle-kshana-ink.ts)
  const resourcesPath = path.join(projectRoot, 'resources', 'kshana-ink');
  const serverBundlePath = path.join(resourcesPath, 'server.bundle.mjs');
  const llmBundlePath = path.join(resourcesPath, 'llm.bundle.mjs');

  console.log('[beforePack] Verifying kshana-ink bundle...');
  console.log(`  Resource path: ${resourcesPath}`);

  if (!fs.existsSync(resourcesPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink resource not found at: ${resourcesPath}`);
    console.error('  Please ensure bundle-kshana-ink.ts script ran successfully');
    throw new Error('kshana-ink resource not found - cannot package app');
  }

  if (!fs.existsSync(serverBundlePath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink server bundle not found at: ${serverBundlePath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink server bundle missing - cannot package app');
  }

  if (!fs.existsSync(llmBundlePath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink LLM bundle not found at: ${llmBundlePath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink LLM bundle missing - cannot package app');
  }

  // Calculate bundle sizes
  try {
    const serverSize = fs.statSync(serverBundlePath).size;
    const llmSize = fs.statSync(llmBundlePath).size;
    const totalMB = ((serverSize + llmSize) / (1024 * 1024)).toFixed(2);
    console.log(`[beforePack] ✓ kshana-ink bundle verified (${totalMB} MB total)`);
  } catch (err) {
    console.log('[beforePack] ✓ kshana-ink bundle verified and ready for packaging');
  }
};

