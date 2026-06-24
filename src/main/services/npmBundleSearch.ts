/* eslint-disable compat/compat */

/**
 * Search the npm registry for published Dhee bundle packages — packages tagged
 * with the `dhee-bundle` keyword (the same opt-in guard the engine uses to
 * discover bundles). Powers the "browse published bundles" picker.
 */

export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; json?: () => Promise<unknown> }>;
}

export interface NpmBundleSearchHit {
  name: string;
  /** Human title derived from the package name (npm search has no displayName). */
  displayName: string;
  version: string;
  description: string;
  /** install spec the desktop passes to bundle:install-npm. */
  spec: string;
}

/**
 * "dhee-bundle-cartoon-explainer" → "Cartoon Explainer"; "@dhee_ai/x-pack" → "X Pack";
 * "@dhee_ai/bundle-infographics" → "Infographics" (scoped, `dhee-` prefix dropped).
 */
export function prettifyPackageName(name: string): string {
  const base = name.replace(/^@[^/]+\//, ''); // drop scope
  const stripped = base
    .replace(/^(dhee-)?bundle-/, '')
    .replace(/^(dhee-)?runner-/, '')
    .replace(/^(dhee-)?create-/, '');
  const words = (stripped || base).split(/[-_]/).filter(Boolean);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type NpmBundleSearchResult =
  | { ok: true; hits: NpmBundleSearchHit[] }
  | { ok: false; error: string };

interface SearchParams {
  query?: string;
  registryUrl?: string;
  fetchImpl?: FetchLike;
  size?: number;
}

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';

export async function searchNpmBundles(
  params: SearchParams = {},
): Promise<NpmBundleSearchResult> {
  try {
    const fetchImpl = params.fetchImpl ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined);
    if (!fetchImpl) return { ok: false, error: 'No fetch implementation available.' };

    const registry = (params.registryUrl ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
    const size = Math.min(Math.max(params.size ?? 30, 1), 100);
    // keyword guard + optional free-text query (npm AND-combines terms).
    const text = `keywords:dhee-bundle ${params.query?.trim() ?? ''}`.trim();
    const url = `${registry}/-/v1/search?text=${encodeURIComponent(text)}&size=${size}`;

    const resp = await fetchImpl(url);
    if (!resp.ok || !resp.json) {
      return { ok: false, error: `npm search failed: HTTP ${resp.status}` };
    }
    const body = (await resp.json()) as {
      objects?: Array<{ package?: { name?: string; version?: string; description?: string; keywords?: string[] } }>;
    };
    const hits: NpmBundleSearchHit[] = [];
    for (const obj of body.objects ?? []) {
      const p = obj.package;
      if (!p?.name) continue;
      // The keyword search also surfaces scaffolders (create-dhee-bundle,
      // @dhee_ai/create-bundle, …); they aren't runnable bundles, so drop them.
      if (/(^|\/)create-/.test(p.name)) continue;
      hits.push({
        name: p.name,
        displayName: prettifyPackageName(p.name),
        version: p.version ?? 'latest',
        description: p.description ?? '',
        spec: p.name,
      });
    }
    return { ok: true, hits };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
