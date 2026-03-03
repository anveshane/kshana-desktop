import type { RemotionFailureDetails } from '../../shared/remotionTypes';

export interface ClassifyRemotionFailureInput {
  errorMessage: string;
  stage: RemotionFailureDetails['stage'];
  packaged: boolean;
  remotionDir: string;
  esbuildBinaryPath?: string;
  resolvedModulePaths?: RemotionFailureDetails['resolvedModulePaths'];
}

function isEsbuildSpawnEnotdirFailure(errorMessage: string): boolean {
  if (!/spawn ENOTDIR/i.test(errorMessage)) {
    return false;
  }

  return /esbuild|@remotion\/bundler/i.test(errorMessage);
}

function isAsarRuntimeModuleResolutionFailure(errorMessage: string): boolean {
  if (/Packaged runtime preflight failed/i.test(errorMessage)) {
    return true;
  }
  const hasInvalidAsarPackage = /Invalid package .*app\.asar/i.test(errorMessage);
  const hasAsarNodeModulesPath = /app\.asar\/node_modules\/.*package\.json/i.test(errorMessage);
  const hasModuleNotFoundSignal = /Module not found|directory description file/i.test(errorMessage);
  return hasModuleNotFoundSignal && (hasInvalidAsarPackage || hasAsarNodeModulesPath);
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
    resolvedModulePaths,
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
      resolvedModulePaths,
    };
  }

  if (isAsarRuntimeModuleResolutionFailure(errorMessage)) {
    return {
      code: 'asar_runtime_module_resolution_failed',
      stage,
      packaged,
      remotionDir,
      esbuildBinaryPath,
      hint:
        'Packaged runtime is resolving Remotion modules from app.asar (read-only bundle). Install the latest desktop build that unpacks Remotion runtime deps and retry.',
      resolvedModulePaths,
    };
  }

  return {
    code: 'remotion_render_failed',
    stage,
    packaged,
    remotionDir,
    esbuildBinaryPath,
    resolvedModulePaths,
  };
}
