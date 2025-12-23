// Conditionally run electron-builder install-app-deps
// Skip in CI environments since install-app-deps.ts handles it
if (process.env.CI) {
  console.log(
    'Skipping electron-builder install-app-deps in CI (handled by install-app-deps.ts)',
  );
  process.exit(0);
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootPath = path.resolve(__dirname, '../..');
const appPath = path.join(rootPath, 'release/app');
const appPackagePath = path.join(appPath, 'package.json');
const mainPackagePath = path.join(rootPath, 'package.json');

// Ensure release/app directory exists
if (!fs.existsSync(appPath)) {
  fs.mkdirSync(appPath, { recursive: true });
}

// Read main package.json
let mainPackageJson = {};
if (fs.existsSync(mainPackagePath)) {
  mainPackageJson = JSON.parse(fs.readFileSync(mainPackagePath, 'utf-8'));
} else {
  console.error(`Main package.json not found at ${mainPackagePath}`);
  process.exit(1);
}

// Create or update release/app/package.json without kshana-ink
// This prevents electron-builder from trying to resolve the file: path
let appPackageJson = {};
if (fs.existsSync(appPackagePath)) {
  appPackageJson = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));
} else {
  // Create minimal package.json if it doesn't exist
  appPackageJson = {
    name: mainPackageJson.name || 'kshana-desktop',
    version: mainPackageJson.version || '1.0.0',
    description: mainPackageJson.description || '',
    main: './dist/main/main.js',
    dependencies: {},
  };
}

// Ensure version is set (required by electron-builder)
if (!appPackageJson.version) {
  appPackageJson.version = mainPackageJson.version || '1.0.0';
}

// Ensure main field is set
if (!appPackageJson.main) {
  appPackageJson.main = './dist/main/main.js';
}

// Copy dependencies from main package.json, excluding kshana-ink
// electron-builder install-app-deps will merge these, but we want to exclude kshana-ink
// to prevent it from trying to resolve the file: path
appPackageJson.dependencies = appPackageJson.dependencies || {};
if (mainPackageJson.dependencies) {
  Object.keys(mainPackageJson.dependencies).forEach((dep) => {
    if (dep !== 'kshana-ink') {
      appPackageJson.dependencies[dep] = mainPackageJson.dependencies[dep];
    }
  });
}

// Remove kshana-ink if it exists (from previous runs)
if (appPackageJson.dependencies['kshana-ink']) {
  delete appPackageJson.dependencies['kshana-ink'];
  console.log(
    '✓ Removed kshana-ink from release/app/package.json (will be handled separately)',
  );
}

// Write updated package.json (without kshana-ink)
fs.writeFileSync(
  appPackagePath,
  `${JSON.stringify(appPackageJson, null, 2)}\n`,
);

// Now run electron-builder install-app-deps
// It will read from main package.json but since kshana-ink is not in release/app/package.json,
// it won't try to resolve the file: path during installation
try {
  execSync('electron-builder install-app-deps', { stdio: 'inherit' });
  console.log('✓ electron-builder install-app-deps completed successfully');
} catch (error) {
  console.error('electron-builder install-app-deps failed:', error.message);
  process.exit(1);
}
