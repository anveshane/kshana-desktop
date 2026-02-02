/**
 * Resolves the path to remotion-infographics directory.
 * Used by RemotionManager and backendManager for dev vs packaged environments.
 */
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export function getRemotionInfographicsDir(): string {
  if (app.isPackaged) {
    const kshanaInkRemotion = path.join(
      __dirname,
      '../../node_modules/kshana-ink/remotion-infographics',
    );
    if (fs.existsSync(kshanaInkRemotion)) {
      return path.resolve(kshanaInkRemotion);
    }
    const resourcesRemotion = path.join(
      process.resourcesPath || '',
      'remotion-infographics',
    );
    if (fs.existsSync(resourcesRemotion)) {
      return path.resolve(resourcesRemotion);
    }
    const appPath = app.getAppPath();
    const appRemotion = path.join(path.dirname(appPath), 'remotion-infographics');
    if (fs.existsSync(appRemotion)) {
      return path.resolve(appRemotion);
    }
  } else {
    const devRemotionInKshanaInk = path.join(
      __dirname,
      '../../node_modules/kshana-ink/remotion-infographics',
    );
    if (fs.existsSync(devRemotionInKshanaInk)) {
      return path.resolve(devRemotionInKshanaInk);
    }
    const siblingRemotion = path.join(
      __dirname,
      '../../kshana-ink/remotion-infographics',
    );
    if (fs.existsSync(siblingRemotion)) {
      return path.resolve(siblingRemotion);
    }
    const rootRemotion = path.join(
      __dirname,
      '../../../remotion-infographics',
    );
    if (fs.existsSync(rootRemotion)) {
      return path.resolve(rootRemotion);
    }
  }

  throw new Error(
    'remotion-infographics not found. Ensure kshana-ink is installed and remotion-infographics exists.',
  );
}
