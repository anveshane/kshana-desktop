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
  if (excludes.some(exclude => itemName === exclude || itemName.startsWith(exclude))) {
    return;
  }
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      // Skip excluded directories/files
      if (excludes.some(exclude => childItemName === exclude || childItemName.startsWith(exclude))) {
        return;
      }
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
        excludes
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
      `kshana-ink copy validation failed. Missing required files:\n` +
        missingFiles.map(f => `  - ${f}`).join('\n') +
        `\n\nPlease ensure kshana-ink is built before packaging.`
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

// Extract kshana-ink source path BEFORE removing it from dependencies
let kshanaInkSourcePath: string | null = null;
if (packageJson.dependencies && packageJson.dependencies['kshana-ink']) {
  const kshanaInkDep = packageJson.dependencies['kshana-ink'];
  kshanaInkSourcePath = kshanaInkDep.replace('file:', '');
  
  // Resolve absolute path relative to appPath (release/app)
  // kshanaInkSourcePath is like "../../../kshana-ink" from release/app/package.json
  // path.resolve handles ../ correctly, resolving relative to appPath
  const absoluteKshanaInkPath = path.isAbsolute(kshanaInkSourcePath)
    ? kshanaInkSourcePath
    : path.resolve(appPath, kshanaInkSourcePath);
  
  // Read kshana-ink package.json to merge dependencies
  const kshanaInkPackageJsonPath = path.join(absoluteKshanaInkPath, 'package.json');
  if (fs.existsSync(kshanaInkPackageJsonPath)) {
    try {
      const kshanaInkPackageJson = JSON.parse(
        fs.readFileSync(kshanaInkPackageJsonPath, 'utf-8')
      );
      
      // Merge kshana-ink's dependencies into app dependencies
      if (kshanaInkPackageJson.dependencies) {
        // Exclude CLI-only dependencies (ink and react are now peerDependencies in kshana-ink,
        // so they won't be in dependencies, but we keep this filter for safety/backward compatibility)
        const excludedDeps = ['react', 'react-dom', 'ink'];
        const filteredDeps = Object.fromEntries(
          Object.entries(kshanaInkPackageJson.dependencies as Record<string, string>)
            .filter(([key]) => !excludedDeps.includes(key))
        );
        
        packageJson.dependencies = {
          ...packageJson.dependencies,
          ...filteredDeps,
        };
        
        console.log('✓ Added kshana-ink dependencies to package.json (CLI-only deps excluded)');
      }
    } catch (err) {
      console.warn(`Warning: Could not read kshana-ink package.json: ${(err as Error).message}`);
    }
  }

  // Remove kshana-ink from dependencies to prevent symlink creation
  const { 'kshana-ink': removedDep, ...otherDeps } = packageJson.dependencies;
  packageJson.dependencies = otherDeps;
  
  // Write updated package.json (without kshana-ink)
  fs.writeFileSync(
    appPackagePath,
    JSON.stringify(packageJson, null, 2) + '\n'
  );
  
  console.log('✓ Temporarily removed kshana-ink from dependencies (will copy directly)');
}

const hasDependencies = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;

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

// Copy kshana-ink directly from source (if it was in dependencies)
if (kshanaInkSourcePath) {
  const absoluteKshanaInkPath = path.isAbsolute(kshanaInkSourcePath)
    ? kshanaInkSourcePath
    : path.resolve(appPath, kshanaInkSourcePath);
  
  const kshanaInkDestPath = path.join(appNodeModulesPath, 'kshana-ink');
  
  // Verify source exists
  if (!fs.existsSync(absoluteKshanaInkPath)) {
    throw new Error(
      `kshana-ink source not found at ${absoluteKshanaInkPath}. ` +
        'Please ensure kshana-ink is available at the expected location.'
    );
  }

  console.log(`Copying kshana-ink from ${absoluteKshanaInkPath} to ${kshanaInkDestPath}...`);
  
  // Remove destination if it exists (from previous runs)
  if (fs.existsSync(kshanaInkDestPath)) {
    fs.rmSync(kshanaInkDestPath, { recursive: true, force: true });
  }
  
  // Ensure destination directory exists
  fs.mkdirSync(kshanaInkDestPath, { recursive: true });
  
  // Copy only production artifacts: dist/, package.json, prompts/
  // Note: prompts/ is already copied to dist/prompts/ during kshana-ink build
  const itemsToCopy = ['dist', 'package.json'];
  
  for (const item of itemsToCopy) {
    const srcPath = path.join(absoluteKshanaInkPath, item);
    const destPath = path.join(kshanaInkDestPath, item);
    
    if (fs.existsSync(srcPath)) {
      const stats = fs.statSync(srcPath);
      if (stats.isDirectory()) {
        copyRecursiveSync(srcPath, destPath, []);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } else {
      console.warn(`Warning: ${item} not found in kshana-ink source at ${srcPath}`);
    }
  }
  
  console.log('✓ kshana-ink copied successfully (production artifacts only)');
  
  // Validate copied files
  validateKshanaInkCopy(kshanaInkDestPath);
}
