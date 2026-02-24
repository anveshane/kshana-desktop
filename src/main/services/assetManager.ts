import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from '@ts-ffmpeg/fluent-ffmpeg';

type ImportedMediaType = 'video' | 'audio' | 'image';

interface MediaMetadata {
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  size: number;
  lastModified: number;
}

export interface ImportedMediaResult {
  id: string;
  type: ImportedMediaType;
  relativePath: string;
  absolutePath: string;
  thumbnailRelativePath?: string;
  waveformRelativePath?: string;
  extractedAudioRelativePath?: string;
  metadata: MediaMetadata;
}

export interface ReplaceMediaResult {
  relativePath: string;
  absolutePath: string;
  thumbnailRelativePath?: string;
  waveformRelativePath?: string;
  extractedAudioRelativePath?: string;
  metadata: MediaMetadata;
}

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
  '.webm',
]);
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.wma',
]);
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
]);

function toRelativePath(projectDirectory: string, absolutePath: string): string {
  return path
    .relative(projectDirectory, absolutePath)
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '');
}

function resolveMediaType(sourcePath: string): ImportedMediaType {
  const extension = path.extname(sourcePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  return 'video';
}

function getAssetDirectory(projectDirectory: string, type: ImportedMediaType): string {
  switch (type) {
    case 'video':
      return path.join(projectDirectory, '.kshana', 'assets', 'videos');
    case 'audio':
      return path.join(projectDirectory, '.kshana', 'assets', 'audio');
    default:
      return path.join(projectDirectory, '.kshana', 'assets', 'images');
  }
}

async function ensureAssetDirectories(projectDirectory: string): Promise<void> {
  const dirs = [
    path.join(projectDirectory, '.kshana', 'assets', 'videos'),
    path.join(projectDirectory, '.kshana', 'assets', 'audio'),
    path.join(projectDirectory, '.kshana', 'assets', 'images'),
    path.join(projectDirectory, '.kshana', 'assets', '.cache'),
    path.join(projectDirectory, '.kshana', 'assets', '.cache', 'thumbnails'),
    path.join(projectDirectory, '.kshana', 'assets', '.cache', 'waveforms'),
  ];

  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

function safeFps(rFrameRate: string | undefined): number | undefined {
  if (!rFrameRate || !rFrameRate.includes('/')) return undefined;
  const [numRaw, denRaw] = rFrameRate.split('/');
  const numerator = Number(numRaw);
  const denominator = Number(denRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return undefined;
  }
  if (denominator === 0) return undefined;
  const fps = numerator / denominator;
  return Number.isFinite(fps) ? fps : undefined;
}

async function probeMetadata(sourcePath: string): Promise<Partial<MediaMetadata>> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(sourcePath, (error, data) => {
      if (error || !data) {
        resolve({});
        return;
      }
      const videoStream = data.streams?.find((stream) => stream.codec_type === 'video');
      const formatDuration = data.format?.duration;
      resolve({
        duration:
          typeof formatDuration === 'number' && Number.isFinite(formatDuration)
            ? formatDuration
            : undefined,
        width:
          typeof videoStream?.width === 'number' ? Number(videoStream.width) : undefined,
        height:
          typeof videoStream?.height === 'number' ? Number(videoStream.height) : undefined,
        fps: safeFps(videoStream?.r_frame_rate),
      });
    });
  });
}

async function generateVideoThumbnail(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .screenshots({
        timestamps: ['0.1'],
        filename: path.basename(targetPath),
        folder: path.dirname(targetPath),
        size: '640x?',
      });
  });
}

async function extractAudioTrack(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .noVideo()
      .audioCodec('aac')
      .audioBitrate('192k')
      .outputOptions('-movflags +faststart')
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .save(targetPath);
  });
}

async function generateWaveformPreview(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(sourcePath)
      .complexFilter([
        {
          filter: 'aformat',
          options: 'channel_layouts=mono',
        },
        {
          filter: 'showwavespic',
          options: 's=1200x160:colors=0x58c7ff',
        },
      ])
      .outputOptions(['-frames:v 1'])
      .on('end', () => resolve())
      .on('error', (error) => reject(error))
      .save(targetPath);
  });
}

class AssetManager {
  async importMedia(params: {
    projectDirectory: string;
    sourcePath: string;
    forceType?: ImportedMediaType;
  }): Promise<ImportedMediaResult> {
    const { projectDirectory, sourcePath, forceType } = params;
    await ensureAssetDirectories(projectDirectory);

    const sourceStat = await fs.stat(sourcePath);
    const mediaType = forceType ?? resolveMediaType(sourcePath);
    const extension = path.extname(sourcePath).toLowerCase() || '.bin';
    const id = randomUUID();
    const destinationDir = getAssetDirectory(projectDirectory, mediaType);
    const destinationPath = path.join(destinationDir, `${id}${extension}`);

    await fs.copyFile(sourcePath, destinationPath);

    const probed = await probeMetadata(destinationPath);
    let thumbnailRelativePath: string | undefined;
    let waveformRelativePath: string | undefined;
    let extractedAudioRelativePath: string | undefined;

    if (mediaType === 'video') {
      const thumbnailPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'thumbnails',
        `${id}.jpg`,
      );
      try {
        await generateVideoThumbnail(destinationPath, thumbnailPath);
        thumbnailRelativePath = toRelativePath(projectDirectory, thumbnailPath);
      } catch {
        thumbnailRelativePath = undefined;
      }

      const extractedAudioPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        'audio',
        `${id}.m4a`,
      );
      try {
        await extractAudioTrack(destinationPath, extractedAudioPath);
        extractedAudioRelativePath = toRelativePath(
          projectDirectory,
          extractedAudioPath,
        );

        const waveformPath = path.join(
          projectDirectory,
          '.kshana',
          'assets',
          '.cache',
          'waveforms',
          `${id}.png`,
        );
        await generateWaveformPreview(extractedAudioPath, waveformPath);
        waveformRelativePath = toRelativePath(projectDirectory, waveformPath);
      } catch {
        extractedAudioRelativePath = undefined;
        waveformRelativePath = undefined;
      }
    }

    if (mediaType === 'audio') {
      const waveformPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'waveforms',
        `${id}.png`,
      );
      try {
        await generateWaveformPreview(destinationPath, waveformPath);
        waveformRelativePath = toRelativePath(projectDirectory, waveformPath);
      } catch {
        waveformRelativePath = undefined;
      }
    }

    if (mediaType === 'image') {
      const thumbnailPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'thumbnails',
        `${id}${extension}`,
      );
      try {
        // For images, keep a direct cache copy instead of invoking video frame extraction.
        await fs.copyFile(destinationPath, thumbnailPath);
        thumbnailRelativePath = toRelativePath(projectDirectory, thumbnailPath);
      } catch {
        thumbnailRelativePath = undefined;
      }
    }

    return {
      id,
      type: mediaType,
      relativePath: toRelativePath(projectDirectory, destinationPath),
      absolutePath: destinationPath,
      thumbnailRelativePath,
      waveformRelativePath,
      extractedAudioRelativePath,
      metadata: {
        size: sourceStat.size,
        lastModified: sourceStat.mtimeMs,
        duration: probed.duration,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
      },
    };
  }

  async replaceMedia(params: {
    projectDirectory: string;
    currentRelativePath: string;
    sourcePath: string;
  }): Promise<ReplaceMediaResult> {
    const { projectDirectory, currentRelativePath, sourcePath } = params;
    await ensureAssetDirectories(projectDirectory);

    const absoluteTargetPath = path.join(projectDirectory, currentRelativePath);
    const sourceStat = await fs.stat(sourcePath);
    const mediaType = resolveMediaType(absoluteTargetPath);

    await fs.mkdir(path.dirname(absoluteTargetPath), { recursive: true });
    await fs.copyFile(sourcePath, absoluteTargetPath);

    const probed = await probeMetadata(absoluteTargetPath);
    const cacheId = path.parse(absoluteTargetPath).name;
    const extension = path.extname(absoluteTargetPath).toLowerCase() || '.bin';
    let thumbnailRelativePath: string | undefined;
    let waveformRelativePath: string | undefined;
    let extractedAudioRelativePath: string | undefined;

    if (mediaType === 'video') {
      const thumbnailPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'thumbnails',
        `${cacheId}.jpg`,
      );
      try {
        await generateVideoThumbnail(absoluteTargetPath, thumbnailPath);
        thumbnailRelativePath = toRelativePath(projectDirectory, thumbnailPath);
      } catch {
        thumbnailRelativePath = undefined;
      }

      const extractedAudioPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        'audio',
        `${cacheId}.m4a`,
      );
      try {
        await extractAudioTrack(absoluteTargetPath, extractedAudioPath);
        extractedAudioRelativePath = toRelativePath(
          projectDirectory,
          extractedAudioPath,
        );

        const waveformPath = path.join(
          projectDirectory,
          '.kshana',
          'assets',
          '.cache',
          'waveforms',
          `${cacheId}.png`,
        );
        await generateWaveformPreview(extractedAudioPath, waveformPath);
        waveformRelativePath = toRelativePath(projectDirectory, waveformPath);
      } catch {
        extractedAudioRelativePath = undefined;
        waveformRelativePath = undefined;
      }
    }

    if (mediaType === 'audio') {
      const waveformPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'waveforms',
        `${cacheId}.png`,
      );
      try {
        await generateWaveformPreview(absoluteTargetPath, waveformPath);
        waveformRelativePath = toRelativePath(projectDirectory, waveformPath);
      } catch {
        waveformRelativePath = undefined;
      }
    }

    if (mediaType === 'image') {
      const thumbnailPath = path.join(
        projectDirectory,
        '.kshana',
        'assets',
        '.cache',
        'thumbnails',
        `${cacheId}${extension}`,
      );
      try {
        await fs.copyFile(absoluteTargetPath, thumbnailPath);
        thumbnailRelativePath = toRelativePath(projectDirectory, thumbnailPath);
      } catch {
        thumbnailRelativePath = undefined;
      }
    }

    return {
      relativePath: currentRelativePath.replace(/\\/g, '/'),
      absolutePath: absoluteTargetPath,
      thumbnailRelativePath,
      waveformRelativePath,
      extractedAudioRelativePath,
      metadata: {
        size: sourceStat.size,
        lastModified: sourceStat.mtimeMs,
        duration: probed.duration,
        width: probed.width,
        height: probed.height,
        fps: probed.fps,
      },
    };
  }
}

export const assetManager = new AssetManager();
