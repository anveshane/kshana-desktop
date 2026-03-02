import { describe, expect, it } from '@jest/globals';
import { classifyRemotionFailure } from './remotionErrorDiagnostics';

describe('remotionErrorDiagnostics', () => {
  it('classifies esbuild ENOTDIR spawn errors', () => {
    const details = classifyRemotionFailure({
      errorMessage:
        'Module build failed (from @remotion/bundler): Error: spawn ENOTDIR at ensureServiceIsRunning (/.../esbuild/lib/main.js:1982:29)',
      stage: 'bundling',
      packaged: true,
      remotionDir: '/tmp/remotion',
      esbuildBinaryPath: '/Applications/Kshana.app/.../esbuild',
    });

    expect(details.code).toBe('esbuild_spawn_enotdir');
    expect(details.stage).toBe('bundling');
    expect(details.packaged).toBe(true);
    expect(details.esbuildBinaryPath).toContain('esbuild');
    expect(details.hint).toContain('app.asar.unpacked');
  });

  it('falls back to generic failure classification', () => {
    const details = classifyRemotionFailure({
      errorMessage: 'ReferenceError: waterGrad is not defined',
      stage: 'rendering',
      packaged: false,
      remotionDir: '/tmp/remotion',
    });

    expect(details.code).toBe('remotion_render_failed');
    expect(details.stage).toBe('rendering');
    expect(details.hint).toBeUndefined();
  });
});
