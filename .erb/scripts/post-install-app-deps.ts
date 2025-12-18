/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

const { appPath, appPackagePath } = webpackPaths;

/**
 * Post-install script for app dependencies.
 * 
 * Note: kshana-ink is now handled separately via prepare-backend-resource.ts
 * and included in extraResources, so it's no longer processed here.
 */

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

console.log('✓ post-install-app-deps completed (kshana-ink now handled via extraResources)');

