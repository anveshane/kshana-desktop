/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

const { appNodeModulesPath } = webpackPaths;

/**
 * Verifies kshana-ink exists in release/app/node_modules before electron-builder runs
 * This ensures kshana-ink is packaged correctly
 */

const kshanaInkPath = path.join(appNodeModulesPath, 'kshana-ink');
const distPath = path.join(kshanaInkPath, 'dist');
const serverIndexPath = path.join(distPath, 'server', 'index.js');
const llmIndexPath = path.join(distPath, 'core', 'llm', 'index.js');

console.log('Verifying kshana-ink is ready for packaging...');
console.log(`Checking: ${kshanaInkPath}`);

if (!fs.existsSync(kshanaInkPath)) {
  console.error(`✗ ERROR: kshana-ink not found at: ${kshanaInkPath}`);
  console.error('  kshana-ink must be copied to release/app/node_modules before packaging');
  console.error('  Run: ts-node ./.erb/scripts/post-install-app-deps.ts');
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

console.log('✓ kshana-ink verified and ready for packaging');
console.log(`  - Directory: ${kshanaInkPath}`);
console.log(`  - Server: ${serverIndexPath}`);
console.log(`  - LLM: ${llmIndexPath}`);

