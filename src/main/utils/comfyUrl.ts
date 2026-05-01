/**
 * Resolve the ComfyUI URL from AppSettings. Used by the embedded
 * kshana-ink integration (KshanaCoreManager) and — until the legacy
 * cleanup lands — by localBackendManager.
 *
 * The settings model has two shapes:
 *   - `inherit`: use the kshana-ink default (env var or built-in)
 *   - `custom`: use the URL the user typed in the desktop's settings UI
 *
 * Extracted out of localBackendManager so the embedded code path
 * doesn't pull the spawn-mode logic into its dependency graph.
 */
import type { AppSettings } from '../../shared/settingsTypes';

const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188';

export function getComfyUiUrl(settings: AppSettings): string {
  if (settings.comfyuiMode === 'custom') {
    const trimmed = settings.comfyuiUrl?.trim() ?? '';
    return trimmed || DEFAULT_COMFYUI_URL;
  }
  // 'inherit' — let kshana-ink's tools fall back to env var / built-in
  return settings.comfyuiUrl?.trim() || DEFAULT_COMFYUI_URL;
}

export function isComfyCloudUrl(url: string): boolean {
  return /(^|\.)cloud\.comfy\.org/.test(url);
}

export function withV1Suffix(url: string): string {
  return /\/v1\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/v1`;
}
