import { app } from 'electron';
import log from 'electron-log';
import { bootstrapPackagedEsbuildBinaryPath } from './esbuildBinaryPath';

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
}

bootstrapPackagedEsbuildBinaryPath({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  logger: log,
});
