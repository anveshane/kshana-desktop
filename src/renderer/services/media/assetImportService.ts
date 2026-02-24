import type {
  AssetInfo,
  AssetType,
  KshanaTimelineState,
} from '../../types/kshana';
import type {
  TimelineAudioElement,
  TimelineTrack,
  TimelineTrackElement,
  TimelineVideoElement,
} from '../../types/kshana/timeline';
import {
  createAssetInfo,
  normalizeTimelineState,
} from '../../types/kshana';

export interface ImportedMediaData {
  id: string;
  type: 'video' | 'audio' | 'image';
  relativePath: string;
  absolutePath: string;
  thumbnailRelativePath?: string;
  waveformRelativePath?: string;
  extractedAudioRelativePath?: string;
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    size: number;
    lastModified: number;
  };
}

export function importedMediaToAssetType(
  mediaType: ImportedMediaData['type'],
): AssetType {
  if (mediaType === 'video') return 'final_video';
  if (mediaType === 'audio') return 'final_audio';
  return 'scene_image';
}

export function importedMediaToAssetInfo(data: ImportedMediaData): AssetInfo {
  const assetType = importedMediaToAssetType(data.type);
  const metadata: Record<string, unknown> = {
    imported: true,
    duration: data.metadata.duration,
    width: data.metadata.width,
    height: data.metadata.height,
    fps: data.metadata.fps,
    size: data.metadata.size,
    lastModified: data.metadata.lastModified,
    thumbnailPath: data.thumbnailRelativePath,
    waveformPath: data.waveformRelativePath,
    extractedAudioPath: data.extractedAudioRelativePath,
  };

  return createAssetInfo(data.id, assetType, data.relativePath, 1, {
    metadata,
  });
}

function createTrackId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTrackEndTime(track: TimelineTrack | undefined): number {
  if (!track || track.elements.length === 0) return 0;
  return Math.max(
    ...track.elements.map(
      (element) => element.start_time_seconds + element.duration_seconds,
    ),
  );
}

function createVideoElement(
  sourcePath: string,
  durationSeconds: number,
  startSeconds: number,
): TimelineVideoElement {
  return {
    id: createTrackId('el-video'),
    type: 'video',
    name: sourcePath.split('/').pop() || 'Imported video',
    duration_seconds: durationSeconds,
    start_time_seconds: startSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
    opacity: 1,
    blend_mode: 'normal',
    source_path: sourcePath,
    metadata: {
      sourceRef: 'import',
    },
  };
}

function createImageElement(
  sourcePath: string,
  durationSeconds: number,
  startSeconds: number,
): TimelineVideoElement {
  return {
    ...createVideoElement(sourcePath, durationSeconds, startSeconds),
    id: createTrackId('el-image'),
    type: 'image',
    name: sourcePath.split('/').pop() || 'Imported image',
  };
}

function createAudioElement(
  sourcePath: string,
  durationSeconds: number,
  startSeconds: number,
): TimelineAudioElement {
  return {
    id: createTrackId('el-audio'),
    type: 'audio',
    name: sourcePath.split('/').pop() || 'Imported audio',
    duration_seconds: durationSeconds,
    start_time_seconds: startSeconds,
    trim: { in_seconds: 0, out_seconds: 0 },
    transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
    opacity: 1,
    blend_mode: 'normal',
    source_path: sourcePath,
    volume: 1,
    muted: false,
    metadata: {
      sourceRef: 'import',
    },
  };
}

function ensureTrack(
  tracks: TimelineTrack[],
  options: {
    type: TimelineTrack['type'];
    name: string;
    isMain?: boolean;
  },
): TimelineTrack {
  const existing = tracks.find((track) => {
    if (track.type !== options.type) return false;
    if (options.isMain === undefined) return true;
    return Boolean(track.is_main) === Boolean(options.isMain);
  });
  if (existing) return existing;

  const created: TimelineTrack = {
    id: createTrackId('track'),
    name: options.name,
    type: options.type,
    is_main: Boolean(options.isMain),
    muted: false,
    hidden: false,
    elements: [],
  };
  tracks.push(created);
  return created;
}

function appendElementToTrack(
  track: TimelineTrack,
  element: TimelineTrackElement,
): TimelineTrack {
  return {
    ...track,
    elements: [...track.elements, element],
  };
}

export function appendImportedMediaToTimelineState(
  timelineState: KshanaTimelineState,
  data: ImportedMediaData,
): KshanaTimelineState {
  const normalized = normalizeTimelineState(timelineState);
  const tracks = [...normalized.tracks];
  const duration = data.metadata.duration ?? (data.type === 'image' ? 5 : 0);

  if (data.type === 'video') {
    const videoTrack = ensureTrack(tracks, {
      type: 'video',
      name: 'Main Track',
      isMain: true,
    });
    const startSeconds = getTrackEndTime(videoTrack);
    const videoElement = createVideoElement(data.relativePath, duration, startSeconds);
    const nextVideoTrack = appendElementToTrack(videoTrack, videoElement);
    const videoTrackIndex = tracks.findIndex((track) => track.id === videoTrack.id);
    tracks[videoTrackIndex] = nextVideoTrack;

    if (data.extractedAudioRelativePath) {
      const audioTrack = ensureTrack(tracks, {
        type: 'audio',
        name: 'Audio Track',
      });
      const audioElement = createAudioElement(
        data.extractedAudioRelativePath,
        duration,
        startSeconds,
      );
      const nextAudioTrack = appendElementToTrack(audioTrack, audioElement);
      const audioTrackIndex = tracks.findIndex((track) => track.id === audioTrack.id);
      tracks[audioTrackIndex] = nextAudioTrack;
    }

    return normalizeTimelineState({
      ...normalized,
      tracks,
      imported_clips: [
        ...normalized.imported_clips,
        {
          id: videoElement.id,
          path: data.relativePath,
          duration_seconds: duration,
          start_time_seconds: startSeconds,
          track: 'main',
        },
      ],
    });
  }

  if (data.type === 'audio') {
    const audioTrack = ensureTrack(tracks, {
      type: 'audio',
      name: 'Audio Track',
    });
    const startSeconds = 0;
    const audioElement = createAudioElement(data.relativePath, duration, startSeconds);
    const nextAudioTrack = appendElementToTrack(audioTrack, audioElement);
    const audioTrackIndex = tracks.findIndex((track) => track.id === audioTrack.id);
    tracks[audioTrackIndex] = nextAudioTrack;

    return normalizeTimelineState({
      ...normalized,
      tracks,
    });
  }

  const videoTrack = ensureTrack(tracks, {
    type: 'video',
    name: 'Main Track',
    isMain: true,
  });
  const startSeconds = getTrackEndTime(videoTrack);
  const imageElement = createImageElement(data.relativePath, duration || 5, startSeconds);
  const nextVideoTrack = appendElementToTrack(videoTrack, imageElement);
  const videoTrackIndex = tracks.findIndex((track) => track.id === videoTrack.id);
  tracks[videoTrackIndex] = nextVideoTrack;

  return normalizeTimelineState({
    ...normalized,
    tracks,
  });
}

export async function importMediaToProject(params: {
  projectDirectory: string;
  sourcePath: string;
  forceType?: ImportedMediaData['type'];
}): Promise<ImportedMediaData> {
  const result = await window.electron.project.importMedia(
    params.projectDirectory,
    params.sourcePath,
    params.forceType,
  );
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to import media');
  }
  return result.data;
}

export async function replaceMediaInProject(params: {
  projectDirectory: string;
  currentRelativePath: string;
  sourcePath: string;
}): Promise<{
  relativePath: string;
  absolutePath: string;
  thumbnailRelativePath?: string;
  waveformRelativePath?: string;
  extractedAudioRelativePath?: string;
  metadata: ImportedMediaData['metadata'];
}> {
  const result = await window.electron.project.replaceMedia(
    params.projectDirectory,
    params.currentRelativePath,
    params.sourcePath,
  );
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to replace media');
  }
  return result.data;
}
