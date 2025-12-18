/// <reference types="node" />
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

/**
 * Bundles kshana-ink into single files with all dependencies included.
 * This eliminates the need for node_modules and reduces size significantly.
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

console.log(`Bundling kshana-ink from: ${foundSource}`);

// Ensure resources directory exists
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Remove existing bundle
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

// Node.js built-in modules that should not be bundled
const nodeBuiltins = [
  'events',
  'fs',
  'path',
  'url',
  'http',
  'https',
  'stream',
  'util',
  'crypto',
  'buffer',
  'os',
  'net',
  'tls',
  'dns',
  'zlib',
  'querystring',
  'assert',
  'child_process',
  'cluster',
  'dgram',
  'module',
  'perf_hooks',
  'process',
  'punycode',
  'readline',
  'repl',
  'string_decoder',
  'timers',
  'tty',
  'vm',
  'worker_threads',
];

// External patterns: Node.js built-ins (with and without node: prefix) and electron
const externalPatterns = [
  'electron',
  ...nodeBuiltins,
  ...nodeBuiltins.map(m => `node:${m}`),
];

async function bundleModules() {
  console.log('Bundling server module...');
  try {
    await build({
      entryPoints: [serverEntry],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile: path.join(kshanaInkTargetPath, 'server.bundle.mjs'),
      external: externalPatterns, // Don't bundle Node.js built-ins or electron
      minify: true,
      sourcemap: false,
      treeShaking: true,
      banner: {
        js: '// Bundled kshana-ink server module',
      },
    });
    console.log('✓ Server module bundled successfully');
  } catch (err) {
    console.error('✗ ERROR: Failed to bundle server:', err);
    process.exit(1);
  }

  console.log('Bundling LLM module...');
  try {
    await build({
      entryPoints: [llmEntry],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'esm',
      outfile: path.join(kshanaInkTargetPath, 'llm.bundle.mjs'),
      external: externalPatterns,
      minify: true,
      sourcemap: false,
      treeShaking: true,
      banner: {
        js: '// Bundled kshana-ink LLM module',
      },
    });
    console.log('✓ LLM module bundled successfully');
  } catch (err) {
    console.error('✗ ERROR: Failed to bundle LLM:', err);
    process.exit(1);
  }

  // Note: package.json is not needed since all dependencies are bundled

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
    console.log(`✓ Bundle size: ${sizeMB} MB`);
  } catch (err) {
    // Size calculation is optional
  }

  console.log('✓ kshana-ink bundled successfully');
  console.log(`  Output: ${kshanaInkTargetPath}`);
  console.log('  Files:');
  console.log('    - server.bundle.mjs');
  console.log('    - llm.bundle.mjs');
}

// Run bundling
bundleModules().catch((err) => {
  console.error('✗ ERROR: Bundling failed:', err);
  process.exit(1);
});

