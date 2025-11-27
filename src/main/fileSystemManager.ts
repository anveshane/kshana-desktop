import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import chokidar, { FSWatcher } from 'chokidar';
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
  private watcher: FSWatcher | null = null;

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

  watchDirectory(dirPath: string): void {
    if (this.watcher) {
      this.watcher.close();
    }

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
      .on('add', (p) => emitChange('add', p))
      .on('change', (p) => emitChange('change', p))
      .on('unlink', (p) => emitChange('unlink', p))
      .on('addDir', (p) => emitChange('addDir', p))
      .on('unlinkDir', (p) => emitChange('unlinkDir', p));
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
}

export default new FileSystemManager();
