import { app } from 'electron';
import log from 'electron-log';
import { bootstrapPackagedEsbuildBinaryPath } from './esbuildBinaryPath';

bootstrapPackagedEsbuildBinaryPath({
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  logger: log,
});
