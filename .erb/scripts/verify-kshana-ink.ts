/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/**
 * Verifies kshana-ink exists in resources/kshana-ink before electron-builder runs
 * This ensures kshana-ink is packaged correctly via extraResources
 */

const projectRoot = path.resolve(__dirname, '../..');
const kshanaInkPath = path.join(projectRoot, 'resources', 'kshana-ink');
const serverDistPath = path.join(kshanaInkPath, 'dist', 'server', 'index.js');
const llmDistPath = path.join(kshanaInkPath, 'dist', 'core', 'llm', 'index.js');
const packageJsonPath = path.join(kshanaInkPath, 'package.json');
const nodeModulesPath = path.join(kshanaInkPath, 'node_modules');

console.log('Verifying kshana-ink is ready for packaging...');
console.log(`Checking: ${kshanaInkPath}`);

if (!fs.existsSync(kshanaInkPath)) {
  console.error(`✗ ERROR: kshana-ink resource not found at: ${kshanaInkPath}`);
  console.error('  kshana-ink must be prepared in resources/kshana-ink before packaging');
  console.error('  Run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

if (!fs.existsSync(serverDistPath)) {
  console.error(`✗ ERROR: kshana-ink server dist not found at: ${serverDistPath}`);
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

if (!fs.existsSync(llmDistPath)) {
  console.error(`✗ ERROR: kshana-ink LLM dist not found at: ${llmDistPath}`);
  console.error('\n  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

if (!fs.existsSync(packageJsonPath)) {
  console.error(`✗ ERROR: package.json not found at: ${packageJsonPath}`);
  console.error('\n  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

if (!fs.existsSync(nodeModulesPath)) {
  console.error(`✗ ERROR: node_modules not found at: ${nodeModulesPath}`);
  console.error('\n  Please run: ts-node ./.erb/scripts/bundle-kshana-ink.ts');
  process.exit(1);
}

// Calculate total size
try {
  const getSize = (dir: string): number => {
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

  const totalSize = getSize(kshanaInkPath);
  const totalMB = (totalSize / (1024 * 1024)).toFixed(2);

  console.log('✓ kshana-ink verified and ready for packaging');
  console.log(`  - Directory: ${kshanaInkPath}`);
  console.log(`  - Server: ${serverDistPath}`);
  console.log(`  - LLM: ${llmDistPath}`);
  console.log(`  - Total size: ${totalMB} MB`);
} catch (err) {
  console.log('✓ kshana-ink verified and ready for packaging');
  console.log(`  - Directory: ${kshanaInkPath}`);
  console.log(`  - Server: ${serverDistPath}`);
  console.log(`  - LLM: ${llmDistPath}`);
}

