/** True when `spec` looks like an npm package name (not a filesystem path). */
export function looksLikeNpmPackageSpec(spec: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('.')) return false;
  if (trimmed.includes('://')) return false;
  // @scope/pkg or @scope/pkg#bundleId
  if (/^@[^/@\s]+\/[^@\s#]+/.test(trimmed)) return true;
  // Published Dhee bundle ids (scoped or legacy unscoped).
  if (/^(@[^/]+\/)?dhee-bundle-/.test(trimmed)) return true;
  if (/^@[^/]+\/bundle-/.test(trimmed)) return true;
  return false;
}
