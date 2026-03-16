const RENDERER_DEBUG_LOG_KEY = 'renderer.debug_logs';

function isRendererDebugLoggingEnabled(): boolean {
  try {
    return window.localStorage.getItem(RENDERER_DEBUG_LOG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function debugRendererLog(...args: unknown[]): void {
  if (!isRendererDebugLoggingEnabled()) return;
  console.log(...args);
}

export function debugRendererWarn(...args: unknown[]): void {
  if (!isRendererDebugLoggingEnabled()) return;
  console.warn(...args);
}

export function debugRendererDebug(...args: unknown[]): void {
  if (!isRendererDebugLoggingEnabled()) return;
  console.debug(...args);
}
