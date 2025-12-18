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

  // Verify resources/kshana-ink exists (prepared by bundle-kshana-ink.ts)
  const resourcesPath = path.join(projectRoot, 'resources', 'kshana-ink');
  const serverDistPath = path.join(resourcesPath, 'dist', 'server', 'index.js');
  const llmDistPath = path.join(resourcesPath, 'dist', 'core', 'llm', 'index.js');
  const packageJsonPath = path.join(resourcesPath, 'package.json');
  const nodeModulesPath = path.join(resourcesPath, 'node_modules');

  console.log('[beforePack] Verifying kshana-ink...');
  console.log(`  Resource path: ${resourcesPath}`);

  if (!fs.existsSync(resourcesPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink resource not found at: ${resourcesPath}`);
    console.error('  Please ensure bundle-kshana-ink.ts script ran successfully');
    throw new Error('kshana-ink resource not found - cannot package app');
  }

  if (!fs.existsSync(serverDistPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink server dist not found at: ${serverDistPath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink server dist missing - cannot package app');
  }

  if (!fs.existsSync(llmDistPath)) {
    console.error(`[beforePack] ✗ ERROR: kshana-ink LLM dist not found at: ${llmDistPath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink LLM dist missing - cannot package app');
  }

  if (!fs.existsSync(packageJsonPath)) {
    console.error(`[beforePack] ✗ ERROR: package.json not found at: ${packageJsonPath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink package.json missing - cannot package app');
  }

  if (!fs.existsSync(nodeModulesPath)) {
    console.error(`[beforePack] ✗ ERROR: node_modules not found at: ${nodeModulesPath}`);
    console.error('  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
    throw new Error('kshana-ink node_modules missing - cannot package app');
  }

  // Calculate total size
  try {
    const getSize = (dir) => {
      let size = 0;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          size += getSize(filePath);
        } else {
          size += stats.size;
        }
      }
      return size;
    };

    const totalSize = getSize(resourcesPath);
    const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`[beforePack] ✓ kshana-ink verified (${totalMB} MB total)`);
  } catch (err) {
    console.log('[beforePack] ✓ kshana-ink verified and ready for packaging');
  }
};

