/// <reference types="node" />
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

const { appPath, appPackagePath, appNodeModulesPath } = webpackPaths;

/**
 * Post-install script to handle kshana-ink file dependency.
 * 
 * This script:
 * 1. Copies kshana-ink to release/app/node_modules (dereferencing symlinks)
 * 2. Removes file dependency from release/app/package.json
 * 3. Verifies no symlinks exist (fails build if found)
 * 4. Removes source files, keeps only dist/, package.json, and node_modules
 */

function findSymlinks(dir: string): string[] {
  const symlinks: string[] = [];
  
  function traverse(currentDir: string) {
    if (!fs.existsSync(currentDir)) {
      return;
    }
    
    const entries = fs.readdirSync(currentDir);
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry);
      
      try {
        const stats = fs.lstatSync(fullPath);
        
        if (stats.isSymbolicLink()) {
          symlinks.push(fullPath);
        } else if (stats.isDirectory()) {
          // Skip node_modules to avoid deep traversal
          if (entry !== 'node_modules') {
            traverse(fullPath);
          }
        }
      } catch (err) {
        // Skip files we can't access
        continue;
      }
    }
  }
  
  traverse(dir);
  return symlinks;
}

// Check if release/app exists
if (!fs.existsSync(appPath)) {
  console.log('release/app directory does not exist, skipping post-install-app-deps');
  process.exit(0);
}

// Check if release/app/package.json exists
if (!fs.existsSync(appPackagePath)) {
  console.log('release/app/package.json does not exist, skipping post-install-app-deps');
  process.exit(0);
}

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));

// Check if kshana-ink is a file dependency
const kshanaInkDep = packageJson.dependencies?.['kshana-ink'];
if (!kshanaInkDep || !kshanaInkDep.startsWith('file:')) {
  console.log('kshana-ink is not a file dependency, skipping post-install-app-deps');
  process.exit(0);
}

console.log('Processing kshana-ink file dependency...');

// Get the source path (relative to release/app)
const filePath = kshanaInkDep.replace('file:', '');
const sourcePath = path.isAbsolute(filePath)
  ? filePath
  : path.resolve(appPath, filePath);

const kshanaInkTargetPath = path.join(appNodeModulesPath, 'kshana-ink');

// Check if source exists
if (!fs.existsSync(sourcePath)) {
  console.error(`✗ ERROR: kshana-ink source not found at: ${sourcePath}`);
  process.exit(1);
}

// Ensure node_modules exists
if (!fs.existsSync(appNodeModulesPath)) {
  fs.mkdirSync(appNodeModulesPath, { recursive: true });
}

// Remove existing kshana-ink (whether symlink or directory)
if (fs.existsSync(kshanaInkTargetPath)) {
  console.log('Removing existing kshana-ink from node_modules...');
  fs.rmSync(kshanaInkTargetPath, { recursive: true, force: true });
}

// Copy kshana-ink using cp -RL to dereference symlinks
console.log(`Copying kshana-ink from ${sourcePath} to ${kshanaInkTargetPath}...`);
try {
  execSync(`cp -RL "${sourcePath}" "${kshanaInkTargetPath}"`, {
    stdio: 'inherit',
  });
  console.log('✓ kshana-ink copied successfully');
} catch (error) {
  console.error(`✗ ERROR: Failed to copy kshana-ink: ${error}`);
  process.exit(1);
}

// Remove source files, keep only dist/, package.json, and node_modules
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

// CRITICAL: Verify no symlinks exist
console.log('Verifying no symlinks exist in kshana-ink...');
const symlinks = findSymlinks(kshanaInkTargetPath);

if (symlinks.length > 0) {
  console.error('✗ ERROR: Symlinks found in kshana-ink!');
  symlinks.forEach(symlink => {
    console.error(`  - ${symlink}`);
  });
  console.error('Build failed: No symlinks allowed in production builds');
  process.exit(1);
} else {
  console.log('✓ No symlinks found - all files are real copies');
}

// Remove file dependency from release/app/package.json
console.log('Updating release/app/package.json to remove file dependency...');
delete packageJson.dependencies['kshana-ink'];

// Write updated package.json
fs.writeFileSync(
  appPackagePath,
  JSON.stringify(packageJson, null, 2) + '\n'
);
console.log('✓ release/app/package.json updated (file dependency removed)');

console.log('✓ post-install-app-deps completed successfully');

