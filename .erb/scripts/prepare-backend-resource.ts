/// <reference types="node" />
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Prepares kshana-ink backend resource for packaging.
 * 
 * This script:
 * 1. Copies kshana-ink from source to resources/kshana-ink
 * 2. Cleans unnecessary files (keeps only dist/, package.json, and node_modules/)
 * 3. Verifies dist/server/index.js and dist/core/llm/index.js exist
 * 4. Fails build if dist files are missing
 */

const projectRoot = path.resolve(__dirname, '../..');
const resourcesDir = path.join(projectRoot, 'resources');
const kshanaInkTargetPath = path.join(resourcesDir, 'kshana-ink');

// Try multiple possible source locations
const possibleSources = [
  path.join(projectRoot, 'node_modules', 'kshana-ink'),
  path.join(projectRoot, '..', 'kshana-ink'),
  path.join(projectRoot, '..', 'node_modules', 'kshana-ink'),
];

// Find the first existing source
let foundSource: string | null = null;
for (const possibleSource of possibleSources) {
  if (fs.existsSync(possibleSource)) {
    // Verify it has dist folder
    const distPath = path.join(possibleSource, 'dist');
    if (fs.existsSync(distPath)) {
      foundSource = possibleSource;
      console.log(`Found kshana-ink source at: ${foundSource}`);
      break;
    }
  }
}

if (!foundSource) {
  console.error(`✗ ERROR: kshana-ink source not found. Checked:`);
  possibleSources.forEach(src => {
    const exists = fs.existsSync(src);
    const distExists = exists && fs.existsSync(path.join(src, 'dist'));
    console.error(`  ${exists ? (distExists ? '✓' : '⚠') : '✗'} ${src}${distExists ? ' (has dist)' : exists ? ' (no dist)' : ''}`);
  });
  console.error('\nPlease ensure kshana-ink is built (run "pnpm build" in kshana-ink directory)');
  process.exit(1);
}

// Ensure resources directory exists
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Remove existing kshana-ink if it exists
if (fs.existsSync(kshanaInkTargetPath)) {
  console.log('Removing existing resources/kshana-ink...');
  fs.rmSync(kshanaInkTargetPath, { recursive: true, force: true });
}

// Copy kshana-ink using cp -RL to dereference symlinks
console.log(`Copying kshana-ink from ${foundSource} to ${kshanaInkTargetPath}...`);
try {
  execSync(`cp -RL "${foundSource}" "${kshanaInkTargetPath}"`, {
    stdio: 'inherit',
  });
  console.log('✓ kshana-ink copied successfully');
} catch (error) {
  console.error(`✗ ERROR: Failed to copy kshana-ink: ${error}`);
  process.exit(1);
}

// Remove source files, keep only dist/, package.json, and node_modules/
console.log('Cleaning up kshana-ink (removing source files)...');
const entries = fs.readdirSync(kshanaInkTargetPath);

for (const entry of entries) {
  const fullPath = path.join(kshanaInkTargetPath, entry);
  
  // Keep these directories/files
  if (entry === 'dist' || entry === 'package.json' || entry === 'node_modules') {
    continue;
  }
  
  try {
    const stats = fs.lstatSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  Removed directory: ${entry}`);
    } else if (stats.isFile()) {
      fs.unlinkSync(fullPath);
      console.log(`  Removed file: ${entry}`);
    }
  } catch (err) {
    console.warn(`  Warning: Could not remove ${entry}: ${(err as Error).message}`);
  }
}

// CRITICAL: Verify dist folder exists and contains required files
console.log('Verifying kshana-ink dist folder exists...');
const distPath = path.join(kshanaInkTargetPath, 'dist');
const serverIndexPath = path.join(distPath, 'server', 'index.js');
const llmIndexPath = path.join(distPath, 'core', 'llm', 'index.js');

if (!fs.existsSync(distPath)) {
  console.error('✗ ERROR: dist folder not found in kshana-ink!');
  console.error(`  Expected at: ${distPath}`);
  console.error('  Contents of kshana-ink:');
  try {
    const contents = fs.readdirSync(kshanaInkTargetPath);
    contents.forEach(item => console.error(`    - ${item}`));
  } catch (err) {
    console.error(`    (Could not read: ${(err as Error).message})`);
  }
  console.error('Build failed: kshana-ink must be built before packaging');
  process.exit(1);
} else {
  console.log('✓ dist folder found');
  
  if (!fs.existsSync(serverIndexPath)) {
    console.error(`✗ ERROR: dist/server/index.js not found at: ${serverIndexPath}`);
    console.error('Build failed: kshana-ink server module missing');
    process.exit(1);
  } else {
    console.log('✓ dist/server/index.js found');
  }
  
  if (!fs.existsSync(llmIndexPath)) {
    console.error(`✗ ERROR: dist/core/llm/index.js not found at: ${llmIndexPath}`);
    console.error('Build failed: kshana-ink llm module missing');
    process.exit(1);
  } else {
    console.log('✓ dist/core/llm/index.js found');
  }
}

console.log('✓ prepare-backend-resource completed successfully');
console.log(`  Resource prepared at: ${kshanaInkTargetPath}`);

