import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { rimrafSync } from 'rimraf';
import webpackPaths from '../configs/webpack.paths';

const { appPath, appPackagePath, appNodeModulesPath } = webpackPaths;

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

// If kshana-ink is listed, we need to include its dependencies too
if (packageJson.dependencies && packageJson.dependencies['kshana-ink']) {
  const kshanaInkPath = packageJson.dependencies['kshana-ink'].replace('file:', '');
  const absoluteKshanaInkPath = path.isAbsolute(kshanaInkPath)
    ? kshanaInkPath
    : path.resolve(appPath, kshanaInkPath);
  
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
        
        // Write updated package.json
        fs.writeFileSync(
          appPackagePath,
          JSON.stringify(packageJson, null, 2) + '\n'
        );
        console.log('✓ Added kshana-ink dependencies to package.json (CLI-only deps excluded)');
      }
    } catch (err) {
      console.warn(`Warning: Could not read kshana-ink package.json: ${(err as Error).message}`);
    }
  }
}

const hasDependencies = packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0;

if (hasDependencies) {
  console.log('Installing app dependencies...');
  
  // Ensure node_modules directory exists
  if (!fs.existsSync(appNodeModulesPath)) {
    fs.mkdirSync(appNodeModulesPath, { recursive: true });
  }

  // Run npm install in release/app directory
  try {
    execSync('npm install', {
      cwd: appPath,
      stdio: 'inherit',
    });
    
    // After installation, if kshana-ink is symlinked, copy it instead
    const kshanaInkPath = path.join(appNodeModulesPath, 'kshana-ink');
    if (fs.existsSync(kshanaInkPath)) {
      try {
        const stats = fs.lstatSync(kshanaInkPath);
        if (stats.isSymbolicLink()) {
          console.log('kshana-ink is symlinked, copying instead...');
          const targetPath = fs.readlinkSync(kshanaInkPath);
          const absoluteTargetPath = path.isAbsolute(targetPath)
            ? targetPath
            : path.resolve(path.dirname(kshanaInkPath), targetPath);
          
          // Remove symlink
          fs.unlinkSync(kshanaInkPath);
          
          // Copy the directory, excluding unnecessary files
          const excludes = [
            'node_modules',
            '.git',
            'logs',
            '.kshana',
            '.env',
            '.env.local',
            '.env.*',
            'src', // We only need the built dist/ directory
            'tests',
            'coverage',
            '.idea',
            '.vscode',
            '*.swp',
            '*.swo',
            '.DS_Store',
            'Thumbs.db',
          ];
          
          copyRecursiveSync(absoluteTargetPath, kshanaInkPath, excludes);
          console.log('✓ kshana-ink copied successfully (symlink replaced with copy)');
        } else {
          console.log('✓ kshana-ink is already a directory (not a symlink)');
        }
      } catch (err) {
        console.warn(`Warning: Could not check/copy kshana-ink: ${(err as Error).message}`);
      }
    }
    
    console.log('App dependencies installed successfully');
  } catch (error) {
    console.error('Failed to install app dependencies:', error);
    process.exit(1);
  }
} else {
  console.log('No app dependencies to install');
}
