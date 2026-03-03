import { app } from 'electron';
import log from 'electron-log';
import * as NodeModule from 'module';
import { bootstrapPackagedEsbuildBinaryPath } from './esbuildBinaryPath';
import { buildPackagedNodePath } from './remotionNodePath';

function sanitizeNodePathForPackagedRuntime(
  resourcesPath: string | undefined,
): { normalizedNodePath: string; changed: boolean } {
  const rawNodePath = process.env.NODE_PATH ?? '';
  const normalizedNodePath = buildPackagedNodePath(
    rawNodePath,
    resourcesPath,
  );
  const changed = normalizedNodePath !== rawNodePath;

  if (changed) {
    process.env.NODE_PATH = normalizedNodePath;
    const moduleWithInitPaths = NodeModule as unknown as {
      _initPaths?: () => void;
    };
    moduleWithInitPaths._initPaths?.();
  }

  return {
    normalizedNodePath,
    changed,
  };
}

if (app.isPackaged) {
  const currentCwd = process.cwd();
  log.info('[RemotionBootstrap] Startup cwd=%s', currentCwd);
  if (currentCwd.includes('app.asar')) {
    const safeCwd = app.getPath('userData');
    try {
      process.chdir(safeCwd);
      log.info(
        '[RemotionBootstrap] Changed process.cwd from %s to %s for esbuild compatibility',
        currentCwd,
        safeCwd,
      );
    } catch (error) {
      log.warn(
        '[RemotionBootstrap] Failed to change process.cwd from %s to %s: %s',
        currentCwd,
        safeCwd,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const nodePathResult = sanitizeNodePathForPackagedRuntime(
    process.resourcesPath,
  );
  if (nodePathResult.changed) {
    log.info(
      '[RemotionBootstrap] Normalized NODE_PATH for packaged runtime: %s',
      nodePathResult.normalizedNodePath,
    );
  }
  log.info(
    '[RemotionBootstrap] Final NODE_PATH=%s',
    nodePathResult.normalizedNodePath || '(empty)',
  );
}

bootstrapPackagedEsbuildBinaryPath({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  logger: log,
});
