/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Verifies kshana-ink exists in resources/kshana-ink before electron-builder runs
 * This ensures kshana-ink is packaged correctly via extraResources
 */

const projectRoot = path.resolve(__dirname, '../..');
const kshanaInkPath = path.join(projectRoot, 'resources', 'kshana-ink');
const serverBundlePath = path.join(kshanaInkPath, 'server.bundle.mjs');
const llmBundlePath = path.join(kshanaInkPath, 'llm.bundle.mjs');

console.log('Verifying kshana-ink bundle is ready for packaging...');
console.log(`Checking: ${kshanaInkPath}`);

if (!fs.existsSync(kshanaInkPath)) {
  console.error(`✗ ERROR: kshana-ink resource not found at: ${kshanaInkPath}`);
  console.error('  kshana-ink must be bundled in resources/kshana-ink before packaging');
  console.error('  Run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

if (!fs.existsSync(serverBundlePath)) {
  console.error(`✗ ERROR: kshana-ink server bundle not found at: ${serverBundlePath}`);
  console.error('  Contents of kshana-ink:');
  try {
    const contents = fs.readdirSync(kshanaInkPath);
    contents.forEach((item: string) => console.error(`    - ${item}`));
  } catch (err) {
    console.error(`    (Could not read: ${(err as Error).message})`);
  }
  console.error('\n  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

if (!fs.existsSync(llmBundlePath)) {
  console.error(`✗ ERROR: kshana-ink LLM bundle not found at: ${llmBundlePath}`);
  console.error('\n  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

// Calculate bundle sizes
try {
  const serverSize = fs.statSync(serverBundlePath).size;
  const llmSize = fs.statSync(llmBundlePath).size;
  const totalSize = serverSize + llmSize;
  const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
  const serverMB = (serverSize / (1024 * 1024)).toFixed(2);
  const llmMB = (llmSize / (1024 * 1024)).toFixed(2);

  console.log('✓ kshana-ink bundle verified and ready for packaging');
  console.log(`  - Directory: ${kshanaInkPath}`);
  console.log(`  - Server bundle: ${serverBundlePath} (${serverMB} MB)`);
  console.log(`  - LLM bundle: ${llmBundlePath} (${llmMB} MB)`);
  console.log(`  - Total size: ${totalMB} MB`);
} catch (err) {
  console.log('✓ kshana-ink bundle verified and ready for packaging');
  console.log(`  - Directory: ${kshanaInkPath}`);
  console.log(`  - Server bundle: ${serverBundlePath}`);
  console.log(`  - LLM bundle: ${llmBundlePath}`);
}

