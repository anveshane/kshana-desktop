import { readFileSync, statSync } from 'fs';
import path from 'path';

import {
  defaultRunnersNodeModulesDir,
  installMissingBundleRunners,
} from './npmBundleInstaller';
import { BUILTIN_RUNNER_TOOLS } from '../builtinRunnerTools';

function activeRunnersNodeModulesDir(homeDir: string): string {
  const configured = process.env.DHEE_RUNNERS_DIR?.trim();
  if (configured) return path.join(configured, 'node_modules');
  return defaultRunnersNodeModulesDir(homeDir);
}

type DagModule = {
  parseBundleSource: (uri: string) => unknown;
  resolveBundleDir: (source: unknown) => string;
  loadBundle: (path: string) => { dependencies?: unknown };
  discoverNpmRunners: () => Promise<unknown>;
};

function loadBundleJsonFromProject(projectDir: string, dag: DagModule): Record<string, unknown> {
  const projectJsonPath = path.join(projectDir, 'project.json');
  const project = JSON.parse(readFileSync(projectJsonPath, 'utf8')) as {
    bundleSource?: string;
  };
  if (!project.bundleSource || typeof project.bundleSource !== 'string') {
    throw new Error('project.json is missing bundleSource');
  }
  const source = dag.parseBundleSource(project.bundleSource);
  const bundlePathOrDir = dag.resolveBundleDir(source);
  const bundleJsonPath = statSync(bundlePathOrDir).isDirectory()
    ? path.join(bundlePathOrDir, 'bundle.json')
    : bundlePathOrDir;
  return dag.loadBundle(bundleJsonPath) as Record<string, unknown>;
}

/**
 * Install npm runner packages declared by the project's bundle (when not
 * built-in), then register them with dhee-core's global registry.
 */
export async function ensureProjectExternalRunners(
  projectDir: string,
  homeDir: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dagModulePath = 'dhee-core/dag';
    const dag = (await import(/* webpackIgnore: true */ dagModulePath)) as DagModule;
    const bundleJson = loadBundleJsonFromProject(projectDir, dag);
    const runnersDir = activeRunnersNodeModulesDir(homeDir);
    const { runnerErrors } = await installMissingBundleRunners({
      bundleJson,
      runnersNodeModulesDir: runnersDir,
      builtinTools: BUILTIN_RUNNER_TOOLS,
    });
    if (runnerErrors.length > 0) {
      const detail = runnerErrors
        .map((e) => `${e.tool} (${e.packageName}): ${e.error}`)
        .join('; ');
      return { ok: false, error: `Failed to install external runners: ${detail}` };
    }
    await dag.discoverNpmRunners();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
