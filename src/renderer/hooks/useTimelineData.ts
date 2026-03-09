/**
 * useTimelineData Hook
 * Reads the server-created root timeline.json and normalizes it for the desktop timeline.
 */

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useTranscript } from './useTranscript';
import { useWordCaptions } from './useWordCaptions';
import type { AssetInfo } from '../types/kshana/assetManifest';
import type { SceneVersions } from '../types/kshana/timeline';
import type { TextOverlayCue } from '../types/captions';
import { PROJECT_PATHS } from '../types/kshana';
import type { FileNode } from '../../shared/fileSystemTypes';
import {
  applySegmentTimingOverridesToItems,
  type SegmentTimingOverride,
} from '../utils/timelineImageEditing';

export interface TimelineItem {
  id: string;
  type:
    | 'image'
    | 'video'
    | 'infographic'
    | 'placeholder'
    | 'audio'
    | 'text_overlay';
  startTime: number;
  endTime: number;
  duration: number;
  label: string;
  prompt?: string;
  expandedPrompt?: string;
  placementNumber?: number;
  segmentId?: string;
  sourceType?: 'server_timeline';
  imagePath?: string;
  videoPath?: string;
  audioPath?: string;
  sourceStartTime?: number;
  sourceEndTime?: number;
  sourceOffsetSeconds?: number;
  sourcePlacementNumber?: number;
  sourcePlacementDurationSeconds?: number;
  segmentIndex?: number;
  textOverlayCue?: TextOverlayCue;
}

export interface TimelineData {
  timelineItems: TimelineItem[];
  overlayItems: TimelineItem[];
  textOverlayItems: TimelineItem[];
  textOverlayCues: TextOverlayCue[];
  totalDuration: number;
}

export interface TimelineDataWithRefresh extends TimelineData {
  refreshTimeline: () => Promise<void>;
  refreshAudioFiles: () => Promise<void>;
  timelineSource: 'server_timeline' | 'none';
  error: string | null;
}

export interface TimelineAudioFile {
  path: string;
  duration: number;
}

interface LatestRequestRef {
  current: number;
}

interface ServerTimelineLayer {
  type?: string;
  artifactId?: string;
  filePath?: string;
  metadata?: Record<string, unknown>;
}

interface ServerTimelineSegment {
  id?: string;
  label?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
  fillStatus?: string;
  layers?: ServerTimelineLayer[];
}

interface ServerTimelineDocument {
  version?: string;
  totalDuration?: number;
  segments?: ServerTimelineSegment[];
}

interface TimelineFileState {
  source: 'server_timeline' | 'none';
  timeline: ServerTimelineDocument | null;
  error: string | null;
}

function isSupportedAudioFileName(fileName: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(fileName);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidSegmentRange(segment: ServerTimelineSegment): boolean {
  return (
    isFiniteNumber(segment.startTime) &&
    isFiniteNumber(segment.endTime) &&
    segment.endTime > segment.startTime
  );
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function detectMediaTypeFromPath(pathValue: string): 'image' | 'video' | null {
  const normalized = pathValue.trim().toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif)$/i.test(normalized)) {
    return 'image';
  }
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(normalized)) {
    return 'video';
  }
  return null;
}

function detectMediaTypeFromAsset(
  asset: AssetInfo | undefined,
): 'image' | 'video' | null {
  if (!asset) return null;
  if (asset.type === 'scene_image') return 'image';
  if (asset.type === 'scene_video') return 'video';
  return detectMediaTypeFromPath(asset.path);
}

function getLayerMetadataFilePath(
  layer: ServerTimelineLayer | undefined,
): string | null {
  const metadata = layer?.metadata;
  if (!isObjectRecord(metadata)) return null;
  const value = metadata['file_path'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getFirstVisualLayer(
  segment: ServerTimelineSegment,
): ServerTimelineLayer | undefined {
  return (segment.layers ?? []).find((layer) => layer.type === 'visual');
}

function findAssetByArtifactId(
  artifactId: string | undefined,
  assets: AssetInfo[],
): AssetInfo | undefined {
  if (!artifactId) return undefined;
  return assets.find((asset) => asset.id === artifactId);
}

function resolveSegmentVisual(
  segment: ServerTimelineSegment,
  assets: AssetInfo[],
): { type: 'image' | 'video'; path: string } | null {
  const visualLayer = getFirstVisualLayer(segment);
  if (!visualLayer) return null;

  if (visualLayer.filePath?.trim()) {
    const path = visualLayer.filePath.trim();
    const type = detectMediaTypeFromPath(path);
    if (type) {
      return { type, path };
    }
  }

  const asset = findAssetByArtifactId(visualLayer.artifactId, assets);
  if (asset?.path?.trim()) {
    const type = detectMediaTypeFromAsset(asset);
    if (type) {
      return { type, path: asset.path.trim() };
    }
  }

  const metadataFilePath = getLayerMetadataFilePath(visualLayer);
  if (metadataFilePath) {
    const type = detectMediaTypeFromPath(metadataFilePath);
    if (type) {
      return { type, path: metadataFilePath };
    }
  }

  return null;
}

function createPlaceholderItem(
  startTime: number,
  endTime: number,
  id?: string,
  label: string = 'Original Footage',
): TimelineItem {
  return {
    id: id || `placeholder-${startTime}-${endTime}`,
    type: 'placeholder',
    startTime,
    endTime,
    duration: endTime - startTime,
    label,
  };
}

function fillGapsWithPlaceholders(
  timelineItems: TimelineItem[],
  totalDuration: number,
): TimelineItem[] {
  const allItems: TimelineItem[] = [];
  let currentTime = 0;

  const sorted = [...timelineItems].sort((a, b) => a.startTime - b.startTime);

  for (const item of sorted) {
    if (item.startTime > currentTime) {
      allItems.push(createPlaceholderItem(currentTime, item.startTime));
    }
    allItems.push(item);
    currentTime = Math.max(currentTime, item.endTime);
  }

  if (currentTime < totalDuration) {
    allItems.push(createPlaceholderItem(currentTime, totalDuration));
  }

  return allItems;
}

function getTimelineSegments(
  timeline: ServerTimelineDocument | null,
): ServerTimelineSegment[] {
  if (!timeline || !Array.isArray(timeline.segments)) {
    return [];
  }

  return timeline.segments.filter(isValidSegmentRange);
}

export function getTimelineFileState(
  content: string | null,
): TimelineFileState {
  if (!content) {
    return {
      source: 'none',
      timeline: null,
      error: 'Missing timeline.json in the project root.',
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isObjectRecord(parsed)) {
      return {
        source: 'none',
        timeline: null,
        error: 'timeline.json is invalid.',
      };
    }

    const timeline = parsed as ServerTimelineDocument;
    if (!Array.isArray(timeline.segments)) {
      return {
        source: 'none',
        timeline: null,
        error: 'timeline.json is missing a segments array.',
      };
    }

    return {
      source: 'server_timeline',
      timeline,
      error: null,
    };
  } catch (error) {
    return {
      source: 'none',
      timeline: null,
      error:
        error instanceof Error
          ? `timeline.json is invalid: ${error.message}`
          : 'timeline.json is invalid.',
    };
  }
}

export function buildServerTimelineItems({
  timeline,
  assets,
  segmentOverrides = {},
}: {
  timeline: ServerTimelineDocument | null;
  assets: AssetInfo[];
  segmentOverrides?: Record<string, SegmentTimingOverride>;
}): TimelineItem[] {
  const items = getTimelineSegments(timeline).map((segment) => {
    const startTime = segment.startTime!;
    const endTime = segment.endTime!;
    const label = segment.label?.trim() || segment.id || 'Segment';
    const segmentId = segment.id?.trim() || `segment-${startTime}-${endTime}`;
    const fillStatus = segment.fillStatus ?? 'empty';
    const resolvedVisual = resolveSegmentVisual(segment, assets);

    if (fillStatus === 'filled' && resolvedVisual) {
      return {
        id: segmentId,
        type: resolvedVisual.type,
        startTime,
        endTime,
        duration: endTime - startTime,
        label,
        segmentId,
        sourceType: 'server_timeline' as const,
        imagePath:
          resolvedVisual.type === 'image' ? resolvedVisual.path : undefined,
        videoPath:
          resolvedVisual.type === 'video' ? resolvedVisual.path : undefined,
        sourceStartTime: startTime,
        sourceEndTime: endTime,
      } satisfies TimelineItem;
    }

    return createPlaceholderItem(startTime, endTime, segmentId, label);
  });

  return applySegmentTimingOverridesToItems(items, segmentOverrides).sort(
    (a, b) => a.startTime - b.startTime,
  );
}

export async function collectAudioFilesWithDuration({
  files,
  projectDirectory,
  transcriptDuration,
  getAudioDuration,
}: {
  files: FileNode;
  projectDirectory: string;
  transcriptDuration: number;
  getAudioDuration: (audioPath: string) => Promise<number>;
}): Promise<TimelineAudioFile[]> {
  const audioEntries = (files.children ?? []).filter(
    (file): file is FileNode & { type: 'file'; name: string } =>
      file.type === 'file' && isSupportedAudioFileName(file.name),
  );

  const audioPaths = audioEntries.map(
    (file) => `${PROJECT_PATHS.AGENT_AUDIO}/${file.name}`,
  );

  const durationResults = await Promise.allSettled(
    audioPaths.map(async (audioPath) => {
      const fullAudioPath = `${projectDirectory}/${audioPath}`;
      const duration = await getAudioDuration(fullAudioPath);
      return duration;
    }),
  );

  return audioPaths.map((audioPath, index) => {
    const durationResult = durationResults[index];
    const duration =
      durationResult?.status === 'fulfilled'
        ? durationResult.value
        : transcriptDuration || 0;
    return {
      path: audioPath,
      duration,
    };
  });
}

export async function runLatestAsyncTask<T>({
  requestRef,
  task,
  commit,
}: {
  requestRef: LatestRequestRef;
  task: () => Promise<T>;
  commit: (result: T) => void;
}): Promise<boolean> {
  const requestId = requestRef.current + 1;
  requestRef.current = requestId;

  const result = await task();
  if (requestId !== requestRef.current) {
    return false;
  }

  commit(result);
  return true;
}

export function useTimelineData(
  _activeVersions?: Record<number, SceneVersions>,
): TimelineDataWithRefresh {
  const { isLoaded, assetManifest, timelineState, refreshAssetManifest } =
    useProject();
  const { projectDirectory } = useWorkspace();
  const { totalDuration: transcriptDuration } = useTranscript();
  const { cues: wordCaptionCues } = useWordCaptions();
  const [audioFiles, setAudioFiles] = useState<TimelineAudioFile[]>([]);
  const [timelineFileState, setTimelineFileState] = useState<TimelineFileState>(
    {
      source: 'none',
      timeline: null,
      error: null,
    },
  );
  const audioReloadRequestIdRef = useRef(0);
  const timelineReloadRequestIdRef = useRef(0);

  const loadTimelineFile = useCallback(async () => {
    if (!projectDirectory || !isLoaded) {
      timelineReloadRequestIdRef.current += 1;
      setTimelineFileState((prev) =>
        prev.source === 'none' && prev.timeline === null && prev.error === null
          ? prev
          : {
              source: 'none',
              timeline: null,
              error: null,
            },
      );
      return;
    }

    await runLatestAsyncTask({
      requestRef: timelineReloadRequestIdRef,
      task: async () => {
        const timelinePath = `${projectDirectory}/timeline.json`;
        const content = await window.electron.project
          .readFile(timelinePath)
          .catch(() => null);
        return getTimelineFileState(content);
      },
      commit: (nextState) => {
        setTimelineFileState(nextState);
      },
    });
  }, [projectDirectory, isLoaded]);

  const reloadAudioFiles = useCallback(async () => {
    if (!projectDirectory || !isLoaded) {
      audioReloadRequestIdRef.current += 1;
      setAudioFiles((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    await runLatestAsyncTask({
      requestRef: audioReloadRequestIdRef,
      task: async () => {
        try {
          const audioDir = `${projectDirectory}/${PROJECT_PATHS.AGENT_AUDIO}`;
          const files = await window.electron.project.readTree(audioDir, 1);
          return await collectAudioFilesWithDuration({
            files,
            projectDirectory,
            transcriptDuration,
            getAudioDuration: (audioPath: string) =>
              window.electron.project.getAudioDuration(audioPath),
          });
        } catch (error) {
          console.debug(
            '[useTimelineData] Audio directory not found or error loading:',
            error,
          );
          return [];
        }
      },
      commit: (nextAudioFiles) => {
        setAudioFiles(nextAudioFiles);
      },
    });
  }, [projectDirectory, isLoaded, transcriptDuration]);

  useEffect(() => {
    void loadTimelineFile();
  }, [loadTimelineFile]);

  useEffect(() => {
    void reloadAudioFiles();
  }, [reloadAudioFiles]);

  useEffect(() => {
    if (!projectDirectory) return;

    const normalizedTimelinePath = `${projectDirectory}/timeline.json`.replace(
      /\\/g,
      '/',
    );

    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path.replace(/\\/g, '/');
      const isTimelineFile = filePath === normalizedTimelinePath;
      const isAudioFile = filePath.includes(`/${PROJECT_PATHS.AGENT_AUDIO}/`);

      if (!isTimelineFile && !isAudioFile) return;

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        if (isTimelineFile) {
          void loadTimelineFile();
        }
        if (isAudioFile) {
          void reloadAudioFiles();
        }
        debounceTimeout = null;
      }, 250);
    });

    return () => {
      unsubscribe();
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [projectDirectory, loadTimelineFile, reloadAudioFiles]);

  const refreshTimeline = useCallback(async () => {
    await Promise.all([
      loadTimelineFile(),
      refreshAssetManifest ? refreshAssetManifest() : Promise.resolve(),
    ]);
  }, [loadTimelineFile, refreshAssetManifest]);

  const refreshAudioFiles = useCallback(async () => {
    await reloadAudioFiles();
  }, [reloadAudioFiles]);

  const baseTimelineItems = useMemo(() => {
    if (timelineFileState.source !== 'server_timeline') {
      return [];
    }

    return buildServerTimelineItems({
      timeline: timelineFileState.timeline,
      assets: assetManifest?.assets ?? [],
      segmentOverrides: timelineState.segment_timing_overrides ?? {},
    });
  }, [
    timelineFileState.source,
    timelineFileState.timeline,
    assetManifest,
    timelineState.segment_timing_overrides,
  ]);

  const textOverlayItems: TimelineItem[] = useMemo(() => {
    if (wordCaptionCues.length === 0) return [];
    const cueStart = Math.min(...wordCaptionCues.map((cue) => cue.startTime));
    const cueEnd = Math.max(...wordCaptionCues.map((cue) => cue.endTime));
    const startTime = Number.isFinite(cueStart) ? Math.max(0, cueStart) : 0;
    const endTime = Number.isFinite(cueEnd)
      ? Math.max(startTime + 0.01, cueEnd)
      : startTime + 0.01;

    return [
      {
        id: 'text-overlay-track',
        type: 'text_overlay',
        startTime,
        endTime,
        duration: endTime - startTime,
        label: 'Text Captions',
      },
    ];
  }, [wordCaptionCues]);

  const serverSegments = useMemo(
    () => getTimelineSegments(timelineFileState.timeline),
    [timelineFileState.timeline],
  );

  const serverTimelineDuration = useMemo(() => {
    if (timelineFileState.source !== 'server_timeline') {
      return 0;
    }

    const configuredDuration = timelineFileState.timeline?.totalDuration;
    if (isFiniteNumber(configuredDuration) && configuredDuration > 0) {
      return configuredDuration;
    }

    if (serverSegments.length === 0) {
      return 0;
    }

    return Math.max(...serverSegments.map((segment) => segment.endTime ?? 0));
  }, [timelineFileState.source, timelineFileState.timeline, serverSegments]);

  const error = useMemo(() => {
    if (timelineFileState.source !== 'server_timeline') {
      return timelineFileState.error;
    }

    const configuredDuration = timelineFileState.timeline?.totalDuration;
    if (!isFiniteNumber(configuredDuration) && serverSegments.length > 0) {
      return 'timeline.json is missing a valid totalDuration; using the last segment end time.';
    }

    return timelineFileState.error;
  }, [timelineFileState, serverSegments]);

  const calculatedTotalDuration = useMemo(() => {
    if (timelineFileState.source !== 'server_timeline') {
      return 0;
    }

    const maxAudioDuration =
      audioFiles.length > 0
        ? Math.max(...audioFiles.map((audioFile) => audioFile.duration || 0))
        : 0;
    const textOverlayDuration =
      wordCaptionCues.length > 0
        ? Math.max(...wordCaptionCues.map((cue) => cue.endTime))
        : 0;

    return Math.max(
      serverTimelineDuration,
      maxAudioDuration,
      transcriptDuration || 0,
      textOverlayDuration,
    );
  }, [audioFiles, serverTimelineDuration, transcriptDuration, wordCaptionCues]);

  const timelineItems = useMemo(() => {
    if (timelineFileState.source !== 'server_timeline') {
      return [];
    }

    const visualItems =
      calculatedTotalDuration > 0
        ? fillGapsWithPlaceholders(baseTimelineItems, calculatedTotalDuration)
        : [...baseTimelineItems];
    const items = [...visualItems];

    audioFiles.forEach((audioFile, index) => {
      items.push({
        id: `audio-${index}`,
        type: 'audio',
        startTime: 0,
        endTime: audioFile.duration || calculatedTotalDuration,
        duration: audioFile.duration || calculatedTotalDuration,
        label: 'Audio Track',
        audioPath: audioFile.path,
      });
    });

    items.sort((a, b) => a.startTime - b.startTime);
    return items;
  }, [
    audioFiles,
    baseTimelineItems,
    calculatedTotalDuration,
    timelineFileState.source,
  ]);

  return {
    timelineItems,
    overlayItems: [],
    textOverlayItems,
    textOverlayCues: wordCaptionCues,
    totalDuration: calculatedTotalDuration,
    refreshTimeline,
    refreshAudioFiles,
    timelineSource: timelineFileState.source,
    error,
  };
}
