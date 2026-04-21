import { PROJECT_PATHS } from '../../../types/kshana';

export interface AudioImportProjectBridge {
  selectAudioFile: () => Promise<string | null>;
  createFolder: (
    basePath: string,
    relativePath: string,
  ) => Promise<string | null>;
  copy: (sourcePath: string, destDir: string) => Promise<string>;
}

export interface ImportedAudioResult {
  sourcePath: string;
  destinationPath: string;
  relativePath: string;
  fileName: string;
}

export async function importAudioFromFileToProject({
  projectDirectory,
  projectBridge,
}: {
  projectDirectory: string | null;
  projectBridge: AudioImportProjectBridge;
}): Promise<ImportedAudioResult | null> {
  if (!projectDirectory) return null;

  try {
    const audioPath = await projectBridge.selectAudioFile();
    if (!audioPath) return null;

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

    const destinationPath = await projectBridge.copy(audioPath, audioFolder);
    const normalizedProjectDirectory = projectDirectory.replace(/\\/g, '/');
    const normalizedDestinationPath = destinationPath.replace(/\\/g, '/');
    const relativePath = normalizedDestinationPath.startsWith(
      `${normalizedProjectDirectory}/`,
    )
      ? normalizedDestinationPath.slice(normalizedProjectDirectory.length + 1)
      : `${PROJECT_PATHS.AGENT_AUDIO}/${normalizedDestinationPath.split('/').pop() ?? 'audio'}`;

    return {
      sourcePath: audioPath,
      destinationPath: normalizedDestinationPath,
      relativePath,
      fileName: normalizedDestinationPath.split('/').pop() ?? 'Audio Track',
    };
  } catch {
    return null;
  }
}
