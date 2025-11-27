export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension?: string;
  children?: FileNode[];
}

export type FileType =
  | 'audio'
  | 'video'
  | 'image'
  | 'script'
  | 'text'
  | 'unknown';

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
}

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
}

export const getFileType = (extension?: string): FileType => {
  if (!extension) return 'unknown';
  const ext = extension.toLowerCase();

  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext)) {
    return 'audio';
  }
  if (['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].includes(ext)) {
    return 'video';
  }
  if (
    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].includes(ext)
  ) {
    return 'image';
  }
  if (['.md', '.txt', '.json', '.yaml', '.yml'].includes(ext)) {
    return 'script';
  }
  return 'text';
};
