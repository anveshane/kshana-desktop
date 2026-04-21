import type { AssetManifest } from '../../../types/kshana';

export interface TimelineAssemblyRequest {
  requestId: string;
  projectDir?: string;
  timelineItems: Array<{
    type: 'image' | 'video' | 'placeholder';
    path: string;
    duration: number;
    startTime: number;
    endTime: number;
    sourceOffsetSeconds?: number;
    label?: string;
  }>;
  audioPath?: string;
  overlayItems?: Array<{
    path: string;
    duration: number;
    startTime: number;
    endTime: number;
    label?: string;
  }>;
  textOverlayCues?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
    words?: Array<{
      text: string;
      startTime: number;
      endTime: number;
      charStart: number;
      charEnd: number;
    }>;
  }>;
  promptOverlayCues?: Array<{
    id: string;
    startTime: number;
    endTime: number;
    text: string;
  }>;
  outputIntent: 'final_video';
  outputName: string;
}

export interface TimelineAssemblyProgress {
  requestId: string;
  progress?: number;
  stage?: 'preparing' | 'rendering' | 'persisting' | 'finalizing';
  message?: string;
}

export interface TimelineAssemblyResult {
  requestId: string;
  status: 'completed' | 'failed';
  outputPath?: string;
  duration?: number;
  artifactId?: string;
  manifestRelativePath?: string;
  error?: string;
}

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function sanitizeOutputName(outputName: string): string {
  const trimmed = outputName.trim() || 'final_video';
  const base = trimmed.replace(/\.mp4$/i, '');
  return (base.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'final_video').slice(0, 120);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await window.electron.project.readFile(filePath);
  if (!content) {
    throw new Error(`Missing required file: ${filePath}`);
  }
  return JSON.parse(content) as T;
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await window.electron.project.writeFile(filePath, JSON.stringify(data, null, 2));
}

export async function assembleRemoteFinalVideo(
  activeProjectDir: string,
  request: TimelineAssemblyRequest,
  onProgress?: (progress: TimelineAssemblyProgress) => void,
): Promise<TimelineAssemblyResult> {
  const requestId = request.requestId.trim();
  const requestedProjectDir =
    typeof request.projectDir === 'string' ? request.projectDir.trim() : '';

  if (
    requestedProjectDir &&
    normalizeProjectPath(requestedProjectDir) !==
      normalizeProjectPath(activeProjectDir)
  ) {
    return {
      requestId,
      status: 'failed',
      error:
        'Requested project directory does not match the active desktop project.',
    };
  }

  if (!request.timelineItems.length) {
    return {
      requestId,
      status: 'failed',
      error: 'No timeline items were provided for desktop assembly.',
    };
  }

  onProgress?.({
    requestId,
    progress: 5,
    stage: 'preparing',
    message: 'Preparing desktop final-video assembly.',
  });

  const composed = await window.electron.project.composeTimelineVideo(
    request.timelineItems,
    activeProjectDir,
    request.audioPath,
    request.overlayItems,
    request.textOverlayCues?.map((cue) => ({
      ...cue,
      words: cue.words ?? [],
    })),
    request.promptOverlayCues,
  );

  if (!composed.success || !composed.outputPath) {
    return {
      requestId,
      status: 'failed',
      error: composed.error || 'Desktop composition failed.',
    };
  }

  onProgress?.({
    requestId,
    progress: 80,
    stage: 'persisting',
    message: 'Persisting final video into project assets.',
  });

  const fileName = `${sanitizeOutputName(request.outputName)}.mp4`;
  const manifestRelativePath = `assets/final_video/${fileName}`;
  const absoluteOutputPath = `${normalizeProjectPath(activeProjectDir)}/${manifestRelativePath}`;

  await window.electron.project.mkdir(
    `${normalizeProjectPath(activeProjectDir)}/assets/final_video`,
  );
  await window.electron.project.copyFileExact(
    composed.outputPath,
    absoluteOutputPath,
  );

  const exists = await window.electron.project.checkFileExists(absoluteOutputPath);
  if (!exists) {
    return {
      requestId,
      status: 'failed',
      error: 'Composed output could not be persisted into assets/final_video.',
    };
  }

  const assetId = `final-video-${Date.now()}`;
  const duration =
    typeof composed.duration === 'number' && Number.isFinite(composed.duration)
      ? composed.duration
      : request.timelineItems.reduce((sum, item) => sum + (item.duration || 0), 0);

  const manifestPath = `${normalizeProjectPath(activeProjectDir)}/assets/manifest.json`;
  const projectStatePath = `${normalizeProjectPath(activeProjectDir)}/project.json`;

  const manifest = await readJsonFile<AssetManifest>(manifestPath);
  const nextManifest: AssetManifest = {
    ...manifest,
    assets: [
      ...manifest.assets.filter((asset) => asset.type !== 'final_video'),
      {
        id: assetId,
        type: 'final_video',
        path: manifestRelativePath,
        version: 1,
        created_at: Date.now(),
        metadata: { duration },
      },
    ],
  };

  const projectState = await readJsonFile<Record<string, unknown>>(projectStatePath);
  const nextProjectState = {
    ...projectState,
    finalVideo: {
      artifactId: assetId,
      path: manifestRelativePath,
      duration,
      createdAt: Date.now(),
    },
    productionCompletedAt: Date.now(),
    updatedAt: Date.now(),
    phases: {
      ...((projectState.phases as Record<string, unknown> | undefined) ?? {}),
      video_combine: {
        ...(((projectState.phases as Record<string, unknown> | undefined)?.[
          'video_combine'
        ] as Record<string, unknown> | undefined) ?? {}),
        status: 'completed',
        completedAt: Date.now(),
      },
    },
  } satisfies Record<string, unknown>;

  try {
    await writeJsonFile(manifestPath, nextManifest);
    await writeJsonFile(projectStatePath, nextProjectState);
  } catch (error) {
    return {
      requestId,
      status: 'failed',
      error:
        error instanceof Error
          ? error.message
          : 'Failed to persist final video metadata.',
    };
  }

  onProgress?.({
    requestId,
    progress: 100,
    stage: 'finalizing',
    message: 'Final video persisted and registered.',
  });

  return {
    requestId,
    status: 'completed',
    outputPath: absoluteOutputPath,
    duration,
    artifactId: assetId,
    manifestRelativePath,
  };
}
