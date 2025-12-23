/// <reference types="node" />
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import webpackPaths from '../configs/webpack.paths';

const { appPath, appPackagePath, appNodeModulesPath, rootPath } = webpackPaths;

// Recursive copy function that excludes certain files/directories
function copyRecursiveSync(src: string, dest: string, excludes: string[] = []) {
  const exists = fs.existsSync(src);
  if (!exists) {
    return;
  }

  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();

  const itemName = path.basename(src);
  // Check if this path should be excluded
  if (
    excludes.some(
      (exclude) => itemName === exclude || itemName.startsWith(exclude),
    )
  ) {
    return;
  }

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      // Skip excluded directories/files
      if (
        excludes.some(
          (exclude) =>
            childItemName === exclude || childItemName.startsWith(exclude),
        )
      ) {
        return;
      }
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
        excludes,
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Validate that copied kshana-ink has all required files
 */
function validateKshanaInkCopy(kshanaInkPath: string): void {
  const requiredFiles = [
    'dist/server/index.js',
    'dist/core/llm/index.js',
    'package.json',
  ];

  const missingFiles: string[] = [];

  for (const file of requiredFiles) {
    const filePath = path.join(kshanaInkPath, file);
    if (!fs.existsSync(filePath)) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `kshana-ink copy validation failed. Missing required files:\n${missingFiles
        .map((f) => `  - ${f}`)
        .join('\n')}\n\nPlease ensure kshana-ink is built before packaging.`,
    );
  }

  console.log('✓ kshana-ink copy validation passed');
}

// Ensure release/app directory exists
if (!fs.existsSync(appPath)) {
  fs.mkdirSync(appPath, { recursive: true });
}

// Check if package.json exists in release/app
if (!fs.existsSync(appPackagePath)) {
  console.error(`package.json not found at ${appPackagePath}`);
  process.exit(1);
}

// Read package.json to check for dependencies
const packageJson = JSON.parse(fs.readFileSync(appPackagePath, 'utf-8'));

// Find kshana-ink source path
// Try to get it from package.json first, otherwise use default location
let kshanaInkSourcePath: string | null = null;
let absoluteKshanaInkPath: string | null = null;

if (packageJson.dependencies && packageJson.dependencies['kshana-ink']) {
  const kshanaInkDep = packageJson.dependencies['kshana-ink'];
  const sourcePath = kshanaInkDep.replace('file:', '');

  // If the path points to node_modules/kshana-ink (destination), ignore it
  // This happens when we restored kshana-ink to package.json in a previous run
  if (
    sourcePath === 'node_modules/kshana-ink' ||
    sourcePath.startsWith('node_modules/kshana-ink/')
  ) {
    console.log(
      '⚠ kshana-ink in package.json points to destination (node_modules), will use default location instead',
    );
    // Remove it from package.json
    const { 'kshana-ink': removedDep, ...otherDeps } = packageJson.dependencies;
    packageJson.dependencies = otherDeps;
    fs.writeFileSync(
      appPackagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
    // Set default location path so it gets copied
    const defaultKshanaInkPath = path.resolve(rootPath, '../kshana-ink');
    if (fs.existsSync(defaultKshanaInkPath)) {
      kshanaInkSourcePath = '../kshana-ink';
      absoluteKshanaInkPath = defaultKshanaInkPath;
      console.log('✓ Found kshana-ink at default location');
    } else {
      console.log(
        `⚠ kshana-ink not found at default location: ${defaultKshanaInkPath}`,
      );
    }
  } else {
    kshanaInkSourcePath = sourcePath;

    // Resolve absolute path relative to appPath (release/app)
    // sourcePath is like "../../../kshana-ink" from release/app/package.json
    const resolvedPath = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.resolve(appPath, sourcePath);
    absoluteKshanaInkPath = resolvedPath;

    // Read kshana-ink package.json to merge dependencies
    // Use resolvedPath directly since it's guaranteed to be a string
    const kshanaInkPackageJsonPath = path.join(resolvedPath, 'package.json');
    if (fs.existsSync(kshanaInkPackageJsonPath)) {
      try {
        const kshanaInkPackageJson = JSON.parse(
          fs.readFileSync(kshanaInkPackageJsonPath, 'utf-8'),
        );

        // Merge kshana-ink's dependencies into app dependencies
        if (kshanaInkPackageJson.dependencies) {
          // Exclude CLI-only dependencies (ink and react are now peerDependencies in kshana-ink,
          // so they won't be in dependencies, but we keep this filter for safety/backward compatibility)
          const excludedDeps = ['react', 'react-dom', 'ink'];
          const filteredDeps = Object.fromEntries(
            Object.entries(
              kshanaInkPackageJson.dependencies as Record<string, string>,
            ).filter(([key]) => !excludedDeps.includes(key)),
          );

          packageJson.dependencies = {
            ...packageJson.dependencies,
            ...filteredDeps,
          };

          console.log(
            '✓ Added kshana-ink dependencies to package.json (CLI-only deps excluded)',
          );
        }
      } catch (err) {
        console.warn(
          `Warning: Could not read kshana-ink package.json: ${(err as Error).message}`,
        );
      }
    }

    // Remove kshana-ink from dependencies to prevent symlink creation
    const { 'kshana-ink': removedDep, ...otherDeps } = packageJson.dependencies;
    packageJson.dependencies = otherDeps;

    // Write updated package.json (without kshana-ink)
    fs.writeFileSync(
      appPackagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );

    console.log(
      '✓ Temporarily removed kshana-ink from dependencies (will copy directly)',
    );
  }
} else {
  // kshana-ink not in package.json, try default location relative to kshana-desktop root
  const defaultKshanaInkPath = path.resolve(rootPath, '../kshana-ink');
  console.log(
    `Checking for kshana-ink at default location: ${defaultKshanaInkPath}`,
  );
  if (fs.existsSync(defaultKshanaInkPath)) {
    kshanaInkSourcePath = '../kshana-ink';
    absoluteKshanaInkPath = defaultKshanaInkPath;
    console.log(
      '✓ Found kshana-ink at default location (not in package.json dependencies)',
    );
  } else {
    console.log(
      `⚠ kshana-ink not found at default location: ${defaultKshanaInkPath}`,
    );
  }
}

const hasDependencies =
  packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;

if (hasDependencies) {
  console.log('Installing app dependencies...');

  // Ensure node_modules directory exists
  if (!fs.existsSync(appNodeModulesPath)) {
    fs.mkdirSync(appNodeModulesPath, { recursive: true });
  }

  // Run npm install in release/app directory (kshana-ink is NOT in dependencies, so no symlink created)
  try {
    execSync('npm install', {
      cwd: appPath,
      stdio: 'inherit',
    });

    console.log('✓ App dependencies installed successfully');
  } catch (error) {
    console.error('Failed to install app dependencies:', error);
    process.exit(1);
  }
} else {
  console.log('No app dependencies to install');
}

// Copy kshana-ink directly from source (always copy if source path is found)
if (!kshanaInkSourcePath || !absoluteKshanaInkPath) {
  console.log('⚠ kshana-ink source path not found - skipping copy');
  console.log(`  kshanaInkSourcePath: ${kshanaInkSourcePath}`);
  console.log(`  absoluteKshanaInkPath: ${absoluteKshanaInkPath}`);
  process.exit(1);
} else {
  const finalKshanaInkPath = absoluteKshanaInkPath;
  const kshanaInkDestPath = path.join(appNodeModulesPath, 'kshana-ink');

  // Verify source exists
  if (!fs.existsSync(finalKshanaInkPath)) {
    throw new Error(
      `kshana-ink source not found at ${finalKshanaInkPath}. ` +
        `Please ensure kshana-ink is available at the expected location.`,
    );
  }

  console.log(
    `Copying kshana-ink from ${finalKshanaInkPath} to ${kshanaInkDestPath}...`,
  );

  // Remove destination if it exists (from previous runs)
  if (fs.existsSync(kshanaInkDestPath)) {
    fs.rmSync(kshanaInkDestPath, { recursive: true, force: true });
  }

  // Ensure destination directory exists
  fs.mkdirSync(kshanaInkDestPath, { recursive: true });

  // Copy production artifacts: dist/, package.json, and node_modules/
  // Note: prompts/ is already copied to dist/prompts/ during kshana-ink build
  // We need node_modules/ so kshana-ink's dependencies (like fastify) are available at runtime
  const itemsToCopy = ['dist', 'package.json', 'node_modules'];

  for (const item of itemsToCopy) {
    const srcPath = path.join(finalKshanaInkPath, item);
    const destPath = path.join(kshanaInkDestPath, item);

    if (fs.existsSync(srcPath)) {
      const stats = fs.statSync(srcPath);
      if (stats.isDirectory()) {
        copyRecursiveSync(srcPath, destPath, []);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } else if (item === 'node_modules') {
      console.warn(
        `Warning: node_modules not found in kshana-ink source at ${srcPath}`,
      );
      console.warn(
        '  This may cause runtime errors. Please ensure kshana-ink dependencies are installed.',
      );
    } else {
      console.warn(
        `Warning: ${item} not found in kshana-ink source at ${srcPath}`,
      );
    }
  }

  console.log(
    '✓ kshana-ink copied successfully (production artifacts + dependencies)',
  );

  // Install kshana-ink's dependencies to ensure all transitive dependencies are available
  // This is necessary because npm hoisting might place dependencies at the app level,
  // but kshana-ink needs them in its own node_modules for proper module resolution
  console.log('Installing kshana-ink dependencies...');
  try {
    execSync('npm install --production', {
      cwd: kshanaInkDestPath,
      stdio: 'inherit',
    });
    console.log('✓ kshana-ink dependencies installed successfully');
  } catch (error) {
    console.warn(
      `Warning: Failed to install kshana-ink dependencies: ${(error as Error).message}`,
    );
    console.warn(
      '  Continuing anyway - dependencies may be available at app level',
    );
  }

  // Validate copied files
  validateKshanaInkCopy(kshanaInkDestPath);

  // Restore kshana-ink to package.json so Electron-builder includes it
  // Use file: path pointing to the copied location (relative to release/app)
  // Read package.json again in case it was modified
  const updatedPackageJson = JSON.parse(
    fs.readFileSync(appPackagePath, 'utf-8'),
  );

  // Ensure required fields are present (electron-builder requirements)
  if (!updatedPackageJson.version) {
    // Try to get version from main package.json as fallback
    const mainPackageJsonPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(mainPackageJsonPath)) {
      try {
        const mainPkg = JSON.parse(
          fs.readFileSync(mainPackageJsonPath, 'utf-8'),
        );
        updatedPackageJson.version = mainPkg.version || '1.0.0';
        console.log(
          `✓ Set version from main package.json: ${updatedPackageJson.version}`,
        );
      } catch {
        updatedPackageJson.version = '1.0.0';
        console.log(
          '⚠ Could not read main package.json, using default version: 1.0.0',
        );
      }
    } else {
      updatedPackageJson.version = '1.0.0';
      console.log(
        '⚠ Main package.json not found, using default version: 1.0.0',
      );
    }
  }

  // Ensure main field points to production build (not dev DLL)
  if (
    !updatedPackageJson.main ||
    updatedPackageJson.main.includes('.erb/dll')
  ) {
    updatedPackageJson.main = './dist/main/main.js';
    console.log(
      '✓ Set main entry point to production build: ./dist/main/main.js',
    );
  }

  updatedPackageJson.dependencies = updatedPackageJson.dependencies || {};
  updatedPackageJson.dependencies['kshana-ink'] =
    'file:node_modules/kshana-ink';

  // Write updated package.json (with kshana-ink restored)
  fs.writeFileSync(
    appPackagePath,
    `${JSON.stringify(updatedPackageJson, null, 2)}\n`,
  );

  console.log(
    '✓ Restored kshana-ink to package.json (for Electron-builder inclusion)',
  );
}
