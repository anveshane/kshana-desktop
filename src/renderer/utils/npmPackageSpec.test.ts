import { describe, expect, it } from '@jest/globals';
import { looksLikeNpmPackageSpec } from './npmPackageSpec';

describe('looksLikeNpmPackageSpec', () => {
  it('detects scoped npm bundle names', () => {
    expect(looksLikeNpmPackageSpec('@dhee_ai/bundle-cartoon-explainer')).toBe(true);
    expect(looksLikeNpmPackageSpec('@dhee_ai/bundle-infographics#infographics')).toBe(true);
  });

  it('detects legacy unscoped dhee bundle names', () => {
    expect(looksLikeNpmPackageSpec('dhee-bundle-cartoon-explainer')).toBe(true);
  });

  it('rejects filesystem paths', () => {
    expect(looksLikeNpmPackageSpec('/Users/me/bundles/cartoon_explainer')).toBe(false);
    expect(looksLikeNpmPackageSpec('./bundles/cartoon_explainer')).toBe(false);
  });
});
