import { describe, expect, it } from '@jest/globals';
import {
  normalizeIncomingPath,
  ProjectFileOpGuardError,
  resolveAndValidateProjectPath,
} from './projectFileOpGuard';

describe('projectFileOpGuard', () => {
  it('normalizes malformed leading backslash windows-style path on posix', () => {
    const normalized = normalizeIncomingPath(
      '\\Users\\indhicdev\\Documents\\Demo-3\\.kshana\\context\\index.json',
      'darwin',
      '/Users/indhicdev/Kshana/kshana-desktop',
    );
    expect(normalized).toBe(
      '/Users/indhicdev/Documents/Demo-3/.kshana/context/index.json',
    );
  });

  it('rejects traversal outside project root', () => {
    expect(() =>
      resolveAndValidateProjectPath('../outside.txt', '/Users/dev/project'),
    ).toThrow(ProjectFileOpGuardError);
  });

  it('rejects absolute path outside project root', () => {
    expect(() =>
      resolveAndValidateProjectPath('/tmp/outside.txt', '/Users/dev/project'),
    ).toThrow(ProjectFileOpGuardError);
  });

  it('accepts valid in-project path', () => {
    const resolved = resolveAndValidateProjectPath(
      '.kshana/context/index.json',
      '/Users/dev/project',
    );
    expect(resolved).toBe('/Users/dev/project/.kshana/context/index.json');
  });

  it('supports remote cross-os flow (windows-style emitted path -> posix project path)', () => {
    const normalized = normalizeIncomingPath(
      '\\Users\\indhicdev\\Documents\\Demo-3\\.kshana\\context\\index.json',
      'darwin',
      '/Users/indhicdev/Kshana/kshana-desktop',
    );
    const resolved = resolveAndValidateProjectPath(
      normalized,
      '/Users/indhicdev/Documents/Demo-3',
    );
    expect(resolved).toBe(
      '/Users/indhicdev/Documents/Demo-3/.kshana/context/index.json',
    );
  });
});
