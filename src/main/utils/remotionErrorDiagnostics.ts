import type { RemotionFailureDetails } from '../../shared/remotionTypes';

export interface ClassifyRemotionFailureInput {
  errorMessage: string;
  stage: RemotionFailureDetails['stage'];
  packaged: boolean;
  remotionDir: string;
  esbuildBinaryPath?: string;
}

function isEsbuildSpawnEnotdirFailure(errorMessage: string): boolean {
  if (!/spawn ENOTDIR/i.test(errorMessage)) {
    return false;
  }

  return /esbuild|@remotion\/bundler/i.test(errorMessage);
}

export function classifyRemotionFailure(
  input: ClassifyRemotionFailureInput,
): RemotionFailureDetails {
  const {
    errorMessage,
    stage,
    packaged,
    remotionDir,
    esbuildBinaryPath,
  } = input;

  if (isEsbuildSpawnEnotdirFailure(errorMessage)) {
    return {
      code: 'esbuild_spawn_enotdir',
      stage,
      packaged,
      remotionDir,
      esbuildBinaryPath,
      hint:
        'Packaged runtime could not spawn esbuild. Verify app.asar.unpacked contains @esbuild/<platform-arch>/bin/esbuild and retry.',
    };
  }

  return {
    code: 'remotion_render_failed',
    stage,
    packaged,
    remotionDir,
    esbuildBinaryPath,
  };
}
