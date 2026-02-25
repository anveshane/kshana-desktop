import { PROJECT_PATHS } from '../../../types/kshana';

export interface AudioImportProjectBridge {
  selectAudioFile: () => Promise<string | null>;
  createFolder: (
    basePath: string,
    relativePath: string,
  ) => Promise<string | null>;
  copy: (sourcePath: string, destDir: string) => Promise<string>;
}

export async function importAudioFromFileToProject({
  projectDirectory,
  projectBridge,
  refreshAudioFiles,
}: {
  projectDirectory: string | null;
  projectBridge: AudioImportProjectBridge;
  refreshAudioFiles: () => Promise<void>;
}): Promise<boolean> {
  if (!projectDirectory) return false;

  try {
    const audioPath = await projectBridge.selectAudioFile();
    if (!audioPath) return false;

    const audioFolder = await PROJECT_PATHS.AGENT_AUDIO.split('/')
      .filter(Boolean)
      .reduce<Promise<string>>(
        (basePathPromise, part) =>
          basePathPromise.then(async (basePath) => {
            await projectBridge.createFolder(basePath, part);
            return `${basePath}/${part}`;
          }),
        Promise.resolve(projectDirectory),
      );

    await projectBridge.copy(audioPath, audioFolder);
    await refreshAudioFiles();
    return true;
  } catch {
    return false;
  }
}
