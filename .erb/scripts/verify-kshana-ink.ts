/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Verifies kshana-ink exists in resources/kshana-ink before electron-builder runs
 * This ensures kshana-ink is packaged correctly via extraResources
 */

const projectRoot = path.resolve(__dirname, '../..');
const kshanaInkPath = path.join(projectRoot, 'resources', 'kshana-ink');
const distPath = path.join(kshanaInkPath, 'dist');
const serverIndexPath = path.join(distPath, 'server', 'index.js');
const llmIndexPath = path.join(distPath, 'core', 'llm', 'index.js');

console.log('Verifying kshana-ink resource is ready for packaging...');
console.log(`Checking: ${kshanaInkPath}`);

if (!fs.existsSync(kshanaInkPath)) {
  console.error(`✗ ERROR: kshana-ink resource not found at: ${kshanaInkPath}`);
  console.error('  kshana-ink must be prepared in resources/kshana-ink before packaging');
  console.error('  Run: ts-node ./.erb/scripts/prepare-backend-resource.ts');
  process.exit(1);
}

if (!fs.existsSync(distPath)) {
  console.error(`✗ ERROR: kshana-ink dist folder not found at: ${distPath}`);
  console.error('  Contents of kshana-ink:');
  try {
    const contents = fs.readdirSync(kshanaInkPath);
    contents.forEach((item: string) => console.error(`    - ${item}`));
  } catch (err) {
    console.error(`    (Could not read: ${(err as Error).message})`);
  }
  process.exit(1);
}

if (!fs.existsSync(serverIndexPath)) {
  console.error(`✗ ERROR: kshana-ink server module not found at: ${serverIndexPath}`);
  process.exit(1);
}

if (!fs.existsSync(llmIndexPath)) {
  console.error(`✗ ERROR: kshana-ink llm module not found at: ${llmIndexPath}`);
  process.exit(1);
}

console.log('✓ kshana-ink resource verified and ready for packaging');
console.log(`  - Directory: ${kshanaInkPath}`);
console.log(`  - Server: ${serverIndexPath}`);
console.log(`  - LLM: ${llmIndexPath}`);

