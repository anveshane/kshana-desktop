/**
 * Ambient types for the test bridge surface exposed inside the page.
 * Mirrors the runtime shape installed by `src/renderer/testing/installFakeBridge.ts`.
 */
interface KshanaTestRecordedCall {
  channel: string;
  args: unknown;
  at: number;
}

interface KshanaTestApi {
  loadScenario(scenario: unknown): void;
  emit(eventName: string, data: unknown): void;
  getCalls(channel?: string): KshanaTestRecordedCall[];
  getProject(): { name: string | null; directory: string | null };
  reset(): void;
}

interface Window {
  __kshanaTest?: KshanaTestApi;
}
