/**
 * RemotionManager - Orchestrates Remotion infographic rendering from the desktop app.
 * Manages per-job temp directories, spawns render.mts, tracks progress, and cleans up.
 */
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import log from 'electron-log';
import { app } from 'electron';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { getRemotionInfographicsDir } from './utils/remotionPath';
import {
  buildRemotionPlacements,
  writeRenderConfig,
} from './remotionConfigGenerator';
import type {
  RemotionJob,
  RemotionProgress,
  RemotionTimelineItem,
  ParsedInfographicPlacement,
} from '../shared/remotionTypes';

const JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RENDER_TIMEOUT_MS = 600_000; // 10 minutes

function generateJobId(): string {
  return `remotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return (
      (parseInt(parts[0], 10) || 0) * 3600 +
      (parseInt(parts[1], 10) || 0) * 60 +
      (parseInt(parts[2], 10) || 0)
    );
  }
  if (parts.length === 2) {
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }
  return parseInt(timeStr, 10) || 5;
}

class RemotionManager extends EventEmitter {
  private jobs = new Map<string, RemotionJob>();
  private processes = new Map<string, ChildProcess>();

  /**
   * Create and start a render job.
   */
  async startRender(
    projectDirectory: string,
    timelineItems: RemotionTimelineItem[],
    infographicPlacements: ParsedInfographicPlacement[],
  ): Promise<{ jobId: string; error?: string }> {
    const remotionDir = getRemotionInfographicsDir();
    const buildDir = path.join(remotionDir, 'build');
    const buildIndex = path.join(buildDir, 'index.html');

    try {
      await fs.access(buildIndex);
    } catch {
      return {
        jobId: '',
        error:
          'Remotion bundle not found. Run "pnpm run build" in kshana-ink/remotion-infographics first.',
      };
    }

    const placements = buildRemotionPlacements(
      timelineItems,
      infographicPlacements,
    );
    if (placements.length === 0) {
      return {
        jobId: '',
        error: 'No infographic placements to render.',
      };
    }

    const jobId = generateJobId();
    const tempDir = path.join(
      projectDirectory,
      '.kshana',
      'temp',
      'remotion',
      jobId,
    );

    await fs.mkdir(path.join(tempDir, 'input'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'output'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'logs'), { recursive: true });

    const outDir = path.join(tempDir, 'output');

    const job: RemotionJob = {
      id: jobId,
      projectDirectory,
      status: 'running',
      startTime: Date.now(),
      outputFiles: [],
      tempDir,
    };
    this.jobs.set(jobId, job);

    if (app.isPackaged) {
      this.executeRenderProgrammatic(jobId, buildDir, placements, outDir, tempDir).catch((error) => {
        log.error(`[RemotionManager] Job ${jobId} failed:`, error);
        const job = this.jobs.get(jobId);
        if (job) {
          job.status = 'failed';
          job.endTime = Date.now();
          job.error = error instanceof Error ? error.message : String(error);
          this.emit('job-complete', job);
        }
      });
      return { jobId };
    }

    const configPath = await writeRenderConfig(tempDir, placements);
    const outputJsonPath = path.join(outDir, '_render_output.json');
    const logPath = path.join(tempDir, 'logs', 'render.log');
    const logStream = createWriteStream(logPath);

    // Clear NODE_OPTIONS to avoid inheriting ts-node/register from Electron dev env
    const remotionEnv = { ...process.env, NODE_ENV: 'production', NODE_OPTIONS: '' };
    const proc = spawn(
      'pnpm',
      [
        'run',
        'render',
        '--',
        '--input',
        configPath,
        '--outDir',
        outDir,
        '--output',
        outputJsonPath,
      ],
      {
        cwd: remotionDir,
        env: remotionEnv,
      },
    );

    this.processes.set(jobId, proc);

    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      logStream.write(output);

      const match = output.match(/REMOTION_PROGRESS:(.+)/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]) as {
            placementIndex?: number;
            totalPlacements?: number;
            progress?: number;
            stage?: string;
          };
          const progress: RemotionProgress = {
            jobId,
            placementIndex: parsed.placementIndex ?? 0,
            totalPlacements: parsed.totalPlacements ?? placements.length,
            progress: parsed.progress ?? 0,
            stage: (parsed.stage as RemotionProgress['stage']) ?? 'rendering',
          };
          this.emit('progress', progress);
        } catch (e) {
          log.warn('[RemotionManager] Failed to parse progress:', e);
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      logStream.write(`[STDERR] ${data}`);
    });

    const timeout = setTimeout(() => {
      if (proc.kill('SIGTERM')) {
        log.warn(`[RemotionManager] Job ${jobId} timed out after ${RENDER_TIMEOUT_MS / 1000}s`);
      }
    }, RENDER_TIMEOUT_MS);

    proc.on('close', async (code) => {
      clearTimeout(timeout);
      logStream.end();
      this.processes.delete(jobId);

      const updatedJob = this.jobs.get(jobId);
      if (!updatedJob) return;

      if (code === 0) {
        updatedJob.status = 'completed';
        updatedJob.endTime = Date.now();

        try {
          const content = await fs.readFile(outputJsonPath, 'utf-8');
          const { outputs } = JSON.parse(content) as { outputs?: string[] };
          const rawOutputs = outputs ?? [];

          const destDir = path.join(
            updatedJob.projectDirectory,
            '.kshana',
            'agent',
            'infographic-placements',
          );
          await fs.mkdir(destDir, { recursive: true });

          const manifestPaths: string[] = [];
          for (const srcPath of rawOutputs) {
            const basename = path.basename(srcPath);
            const destPath = path.join(destDir, basename);
            await fs.copyFile(srcPath, destPath);
            manifestPaths.push(`agent/infographic-placements/${basename}`);
          }
          updatedJob.outputFiles = manifestPaths;

          await this.cleanupJobTempDir(jobId);
        } catch (err) {
          log.error('[RemotionManager] Failed to read or copy render output:', err);
          updatedJob.status = 'failed';
          updatedJob.error = 'Render completed but failed to copy output';
        }
      } else {
        updatedJob.status = 'failed';
        updatedJob.endTime = Date.now();
        updatedJob.error = `Render process exited with code ${code}`;

        try {
          await fs.writeFile(
            path.join(tempDir, 'logs', 'error.json'),
            JSON.stringify(
              { jobId, error: updatedJob.error, timestamp: Date.now() },
              null,
              2,
            ),
          );
        } catch {
          // ignore
        }
      }

      this.emit('job-complete', updatedJob);
    });

    return { jobId };
  }

  private async executeRenderProgrammatic(
    jobId: string,
    buildDir: string,
    placements: Array<{
      placementNumber: number;
      startTime: string;
      endTime: string;
      infographicType: string;
      prompt: string;
      data?: Record<string, unknown>;
      componentName: string;
    }>,
    outDir: string,
    tempDir: string,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const buildIndex = path.join(buildDir, 'index.html');
    try {
      await fs.access(buildIndex);
    } catch {
      throw new Error('Remotion bundle not found. Run "generate_all_infographics" to build components first.');
    }

    const fps = 24;
    const outputs: string[] = [];
    const total = placements.length;

    try {
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i]!;

        this.emit('progress', {
          jobId,
          placementIndex: i,
          totalPlacements: total,
          progress: (i / total) * 100,
          stage: 'rendering',
        });

        const durationSeconds = Math.max(1, timeToSeconds(p.endTime) - timeToSeconds(p.startTime));
        const durationInFrames = Math.round(durationSeconds * fps);
        const inputProps = {
          prompt: p.prompt,
          infographicType: p.infographicType,
          data: p.data ?? {},
        };

        const composition = await selectComposition({
          serveUrl: buildDir,
          id: p.componentName,
          inputProps,
        });
        composition.durationInFrames = durationInFrames;

        const baseName = `info${p.placementNumber}_${Date.now().toString(36)}`;
        const outFilePath = path.join(outDir, `${baseName}.webm`);

        await renderMedia({
          composition,
          serveUrl: buildDir,
          codec: 'vp9',
          outputLocation: outFilePath,
          inputProps,
          logLevel: 'error',
          pixelFormat: 'yuva420p',
          imageFormat: 'png',
        });

        outputs.push(outFilePath);

        this.emit('progress', {
          jobId,
          placementIndex: i,
          totalPlacements: total,
          progress: ((i + 1) / total) * 100,
          stage: 'rendering',
        });
      }

      job.status = 'completed';
      job.endTime = Date.now();

      const destDir = path.join(
        job.projectDirectory,
        '.kshana',
        'agent',
        'infographic-placements',
      );
      await fs.mkdir(destDir, { recursive: true });

      const manifestPaths: string[] = [];
      for (const srcPath of outputs) {
        const basename = path.basename(srcPath);
        const destPath = path.join(destDir, basename);
        await fs.copyFile(srcPath, destPath);
        manifestPaths.push(`agent/infographic-placements/${basename}`);
      }
      job.outputFiles = manifestPaths;

      await this.cleanupJobTempDir(jobId);

      this.emit('job-complete', job);
    } catch (error) {
      job.status = 'failed';
      job.endTime = Date.now();
      job.error = error instanceof Error ? error.message : String(error);

      try {
        await fs.writeFile(
          path.join(tempDir, 'logs', 'error.json'),
          JSON.stringify({ jobId, error: job.error, timestamp: Date.now() }, null, 2),
        );
      } catch {
        // ignore
      }

      this.emit('job-complete', job);
      throw error;
    }
  }

  cancelJob(jobId: string): void {
    const proc = this.processes.get(jobId);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(jobId);
    }
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = 'cancelled';
      job.endTime = Date.now();
      this.emit('job-complete', job);
    }
  }

  getJob(jobId: string): RemotionJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  private async cleanupJobTempDir(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job?.tempDir) return;
    try {
      await fs.rm(job.tempDir, { recursive: true, force: true });
    } catch (err) {
      log.error(`[RemotionManager] Failed to cleanup temp for job ${jobId}:`, err);
    }
  }

  /**
   * Clean up old temp directories on app startup.
   */
  async cleanupOnStartup(projectDirectory?: string): Promise<void> {
    const baseDir = projectDirectory
      ? path.join(projectDirectory, '.kshana', 'temp', 'remotion')
      : null;

    if (baseDir) {
      try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        const now = Date.now();
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const jobPath = path.join(baseDir, ent.name);
          const stat = await fs.stat(jobPath);
          if (now - stat.mtimeMs > JOB_MAX_AGE_MS) {
            await fs.rm(jobPath, { recursive: true, force: true });
            log.info(`[RemotionManager] Cleaned up old job temp: ${ent.name}`);
          }
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          log.warn('[RemotionManager] Cleanup error:', err);
        }
      }
    }

    for (const [jobId, job] of this.jobs) {
      if (job.status === 'running') {
        const age = Date.now() - job.startTime;
        if (age > 24 * 60 * 60 * 1000) {
          job.status = 'failed';
          job.endTime = Date.now();
          job.error = 'Job was interrupted (app crashed or closed)';
          this.emit('job-complete', job);
        }
      }
    }
  }
}

export const remotionManager = new RemotionManager();
