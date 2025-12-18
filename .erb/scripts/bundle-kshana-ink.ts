/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Prepares kshana-ink for production by copying dist files and production dependencies.
 * This avoids bundling issues with dynamic requires and Node.js built-ins.
 */

const projectRoot = path.resolve(__dirname, '../..');
const resourcesDir = path.join(projectRoot, 'resources');
const kshanaInkTargetPath = path.join(resourcesDir, 'kshana-ink');

// Find kshana-ink source
const possibleSources = [
  path.join(projectRoot, 'node_modules', 'kshana-ink'),
  path.join(projectRoot, '..', 'kshana-ink'),
  path.join(projectRoot, '..', 'node_modules', 'kshana-ink'),
];

let foundSource: string | null = null;
for (const source of possibleSources) {
  if (fs.existsSync(source)) {
    const distPath = path.join(source, 'dist', 'server', 'index.js');
    if (fs.existsSync(distPath)) {
      foundSource = source;
      console.log(`Found kshana-ink source at: ${foundSource}`);
      break;
    }
  }
}

if (!foundSource) {
  console.error('✗ ERROR: kshana-ink source not found. Checked:');
  possibleSources.forEach(src => {
    const exists = fs.existsSync(src);
    const distExists = exists && fs.existsSync(path.join(src, 'dist', 'server', 'index.js'));
    console.error(`  ${exists ? (distExists ? '✓' : '⚠') : '✗'} ${src}${distExists ? ' (has dist)' : exists ? ' (no dist)' : ''}`);
  });
  console.error('\nPlease ensure kshana-ink is built (run "pnpm build" in kshana-ink directory)');
  process.exit(1);
}

console.log(`Preparing kshana-ink from: ${foundSource}`);

// Ensure resources directory exists
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Remove existing copy
if (fs.existsSync(kshanaInkTargetPath)) {
  console.log('Removing existing resources/kshana-ink...');
  fs.rmSync(kshanaInkTargetPath, { recursive: true, force: true });
}
fs.mkdirSync(kshanaInkTargetPath, { recursive: true });

// Verify dist files exist
const serverEntry = path.join(foundSource, 'dist', 'server', 'index.js');
const llmEntry = path.join(foundSource, 'dist', 'core', 'llm', 'index.js');

if (!fs.existsSync(serverEntry)) {
  console.error(`✗ ERROR: Server entry not found at: ${serverEntry}`);
  console.error('Please run "pnpm build" in kshana-ink directory');
  process.exit(1);
}

if (!fs.existsSync(llmEntry)) {
  console.error(`✗ ERROR: LLM entry not found at: ${llmEntry}`);
  console.error('Please run "pnpm build" in kshana-ink directory');
  process.exit(1);
}

// Copy dist directory
console.log('Copying dist files...');
const distSource = path.join(foundSource, 'dist');
const distTarget = path.join(kshanaInkTargetPath, 'dist');
copyDirectory(distSource, distTarget);
console.log('✓ Dist files copied');

// Copy package.json
const packageJsonSource = path.join(foundSource, 'package.json');
const packageJsonTarget = path.join(kshanaInkTargetPath, 'package.json');
if (fs.existsSync(packageJsonSource)) {
  fs.copyFileSync(packageJsonSource, packageJsonTarget);
  console.log('✓ package.json copied');
}

// Install production dependencies including peer dependencies
console.log('Installing production dependencies...');
try {
  // First install all dependencies (needed for peer dependencies)
  // Then remove dev dependencies to keep size down
  execSync('npm install --legacy-peer-deps --no-audit --no-fund', {
    cwd: kshanaInkTargetPath,
    stdio: 'inherit',
  });
  
  // Remove dev dependencies after installation
  console.log('Removing dev dependencies...');
  execSync('npm prune --production --no-audit --no-fund', {
    cwd: kshanaInkTargetPath,
    stdio: 'inherit',
  });
  
  console.log('✓ Production dependencies installed');
} catch (err) {
  console.error('✗ ERROR: Failed to install dependencies:', err);
  process.exit(1);
}

// Remove unnecessary files to reduce size
console.log('Cleaning up unnecessary files...');
const cleanupPatterns = [
  '**/*.test.js',
  '**/*.spec.js',
  '**/test/**',
  '**/tests/**',
  '**/__tests__/**',
  '**/docs/**',
  '**/doc/**',
  '**/examples/**',
  '**/example/**',
  '**/*.md',
  '**/README*',
  '**/CHANGELOG*',
  '**/LICENSE*',
  '**/.github/**',
  '**/.git/**',
  '**/.gitignore',
  '**/.npmignore',
  '**/tsconfig.json',
  '**/tsconfig.*.json',
  '**/*.ts',
  '**/*.tsx',
  '**/*.map',
];

function shouldDelete(filePath: string, basePath: string): boolean {
  const relativePath = path.relative(basePath, filePath);
  return cleanupPatterns.some(pattern => {
    const regex = new RegExp('^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
    return regex.test(relativePath);
  });
}

function cleanupDirectory(dir: string, basePath: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldDelete(fullPath, basePath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      cleanupDirectory(fullPath, basePath);
    }
  }
}

cleanupDirectory(kshanaInkTargetPath, kshanaInkTargetPath);
console.log('✓ Cleanup completed');

// Calculate and report size
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

  const totalSize = getSize(kshanaInkTargetPath);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
  console.log(`✓ Total size: ${sizeMB} MB`);
} catch (err) {
  // Size calculation is optional
}

console.log('✓ kshana-ink prepared successfully');
console.log(`  Output: ${kshanaInkTargetPath}`);
console.log('  Structure:');
console.log('    - dist/ (compiled TypeScript)');
console.log('    - node_modules/ (production dependencies)');
console.log('    - package.json');

// Helper function to copy directory recursively
function copyDirectory(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
