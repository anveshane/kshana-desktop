// Conditionally run electron-builder install-app-deps
// Skip in CI environments since the CI workflow handles it
if (process.env.CI) {
  console.log(
    'Skipping electron-builder install-app-deps in CI',
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

// Create or update release/app/package.json
let appPackageJson = {};
if (fs.existsSync(appPackagePath)) {
  appPackageJson = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));
} else {
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

// Copy dependencies from main package.json
appPackageJson.dependencies = appPackageJson.dependencies || {};
if (mainPackageJson.dependencies) {
  Object.keys(mainPackageJson.dependencies).forEach((dep) => {
    appPackageJson.dependencies[dep] = mainPackageJson.dependencies[dep];
  });
}

// Write updated package.json
fs.writeFileSync(
  appPackagePath,
  `${JSON.stringify(appPackageJson, null, 2)}\n`,
);

// Run electron-builder install-app-deps
try {
  execSync('electron-builder install-app-deps', { stdio: 'inherit' });
  console.log('✓ electron-builder install-app-deps completed successfully');
} catch (error) {
  console.error('electron-builder install-app-deps failed:', error.message);
  process.exit(1);
}
