export type ArtifactFormat = 'md' | 'json' | 'image' | 'video' | 'audio' | 'file' | 'unknown';

function extOf(outputPath: string | undefined | null): string {
  if (!outputPath) return '';
  const last = outputPath.split(/[\\/]/).pop() ?? outputPath;
  const dot = last.lastIndexOf('.');
  return dot >= 0 ? last.slice(dot).toLowerCase() : '';
}

export function inferArtifactFormat(outputPath: string | undefined | null): ArtifactFormat {
  const ext = extOf(outputPath);
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.m4v', '.mkv'].includes(ext)) return 'video';
  if (['.wav', '.mp3', '.ogg', '.flac', '.m4a'].includes(ext)) return 'audio';
  if (ext === '.json') return 'json';
  if (ext === '.md' || ext === '.txt') return 'md';
  if ([
    '.csv',
    '.tsv',
    '.xlsx',
    '.xls',
    '.zip',
    '.pdf',
    '.html',
    '.xml',
    '.jsonl',
  ].includes(ext)) return 'file';
  return outputPath ? 'file' : 'unknown';
}

export function artifactTypeLabel(outputPath: string | undefined | null): string {
  const ext = extOf(outputPath);
  switch (ext) {
    case '.csv':
      return 'CSV export';
    case '.tsv':
      return 'TSV export';
    case '.xlsx':
    case '.xls':
      return 'Spreadsheet';
    case '.zip':
      return 'Archive';
    case '.pdf':
      return 'PDF';
    case '.jsonl':
      return 'JSONL file';
    case '.html':
      return 'HTML file';
    case '.xml':
      return 'XML file';
    default:
      return ext ? `${ext.slice(1).toUpperCase()} file` : 'Generated file';
  }
}
