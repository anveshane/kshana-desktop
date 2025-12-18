import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import Store from 'electron-store';
import type {
  FileNode,
  RecentProject,
  FileChangeEvent,
} from '../shared/fileSystemTypes';

const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.DS_Store/,
  /\.cache/,
  /__pycache__/,
  /\.pyc$/,
];

const MAX_RECENT_PROJECTS = 10;

interface FileSystemStore {
  recentProjects: RecentProject[];
}

class FileSystemManager extends EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private watcher: any = null;

  private store: Store<FileSystemStore>;

  constructor() {
    super();
    this.store = new Store<FileSystemStore>({
      name: 'file-system',
      defaults: {
        recentProjects: [],
      },
    });
  }

  private shouldIgnore(filePath: string): boolean {
    return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
  }

  async readDirectory(dirPath: string): Promise<FileNode> {
    const stats = await fs.promises.stat(dirPath);
    const name = path.basename(dirPath);

    if (!stats.isDirectory()) {
      const ext = path.extname(name);
      return {
        name,
        path: dirPath,
        type: 'file',
        extension: ext,
      };
    }

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const children: FileNode[] = [];

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (this.shouldIgnore(entryPath)) continue;

      if (entry.isDirectory()) {
        const childNode = await this.readDirectory(entryPath);
        children.push(childNode);
      } else {
        const ext = path.extname(entry.name);
        children.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          extension: ext,
        });
      }
    }

    // Sort: directories first, then files, both alphabetically
    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      name,
      path: dirPath,
      type: 'directory',
      children,
    };
  }

  async watchDirectory(dirPath: string): Promise<void> {
    if (this.watcher) {
      this.watcher.close();
    }

    const chokidar = await import('chokidar');
    this.watcher = chokidar.watch(dirPath, {
      ignored: IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      depth: 10,
    });

    const emitChange = (type: FileChangeEvent['type'], filePath: string) => {
      this.emit('file-change', { type, path: filePath } as FileChangeEvent);
    };

    this.watcher
      .on('add', (p: string) => emitChange('add', p))
      .on('change', (p: string) => emitChange('change', p))
      .on('unlink', (p: string) => emitChange('unlink', p))
      .on('addDir', (p: string) => emitChange('addDir', p))
      .on('unlinkDir', (p: string) => emitChange('unlinkDir', p));
  }

  unwatchDirectory(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  getRecentProjects(): RecentProject[] {
    return this.store.get('recentProjects', []);
  }

  addRecentProject(projectPath: string): void {
    const recentProjects = this.getRecentProjects();
    const name = path.basename(projectPath);
    const now = Date.now();

    // Remove if already exists
    const filtered = recentProjects.filter((p) => p.path !== projectPath);

    // Add to front
    const updated: RecentProject[] = [
      { path: projectPath, name, lastOpened: now },
      ...filtered,
    ].slice(0, MAX_RECENT_PROJECTS);

    this.store.set('recentProjects', updated);
  }

  async rename(oldPath: string, newName: string): Promise<string> {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.promises.rename(oldPath, newPath);
    return newPath;
  }

  async delete(targetPath: string): Promise<void> {
    const stats = await fs.promises.stat(targetPath);
    if (stats.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true });
    } else {
      await fs.promises.unlink(targetPath);
    }
  }

  async move(sourcePath: string, destDir: string): Promise<string> {
    const name = path.basename(sourcePath);
    const destPath = path.join(destDir, name);
    await fs.promises.rename(sourcePath, destPath);
    return destPath;
  }

  async copy(sourcePath: string, destDir: string): Promise<string> {
    const name = path.basename(sourcePath);
    const destPath = path.join(destDir, name);
    
    // Ensure destination directory exists
    await fs.promises.mkdir(destDir, { recursive: true });
    
    const stats = await fs.promises.stat(sourcePath);
    if (stats.isDirectory()) {
      await this.copyDir(sourcePath, destPath);
    } else {
      // Copy file
      await fs.promises.copyFile(sourcePath, destPath);
      
      // Verify copy succeeded by checking file size matches
      // This ensures the file was fully written, especially important for large video files
      const sourceSize = stats.size;
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries) {
        try {
          const destStats = await fs.promises.stat(destPath);
          if (destStats.size === sourceSize) {
            // File sizes match, copy successful
            break;
          }
          // File size doesn't match yet, wait a bit and retry
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries += 1;
        } catch (err) {
          // File doesn't exist yet, wait and retry
          await new Promise((resolve) => setTimeout(resolve, 100));
          retries += 1;
        }
      }
      
      // Final verification
      const destStats = await fs.promises.stat(destPath);
      if (destStats.size !== sourceSize) {
        throw new Error(
          `Copy verification failed: source size ${sourceSize} bytes, destination size ${destStats.size} bytes`,
        );
      }
    }
    
    return destPath;
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  async revealInFinder(targetPath: string): Promise<void> {
    const { shell } = await import('electron');
    shell.showItemInFolder(targetPath);
  }
}

export default new FileSystemManager();
