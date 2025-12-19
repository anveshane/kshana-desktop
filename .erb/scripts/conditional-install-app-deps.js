// Conditionally run electron-builder install-app-deps
// Skip in CI environments since install-app-deps.ts handles it
if (process.env.CI) {
  console.log('Skipping electron-builder install-app-deps in CI (handled by install-app-deps.ts)');
  process.exit(0);
}

const { execSync } = require('child_process');
try {
  execSync('electron-builder install-app-deps', { stdio: 'inherit' });
} catch (error) {
  console.error('electron-builder install-app-deps failed:', error.message);
  process.exit(1);
}

