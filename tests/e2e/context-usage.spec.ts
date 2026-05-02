/**
 * Wave 6 — Context-usage indicator reacts to token-usage events.
 *
 * **FEATURE GAP:** `context_usage` is a defined `KshanaEventName` in
 * `src/shared/kshanaIpc.ts`, but no component in the codebase
 * renders a token-usage indicator. `ChatPanelEmbedded.handleEvent`
 * has no `context_usage` case, and grepping the renderer for any
 * "context_usage" or "tokenUsage" UI found nothing.
 *
 * Both cases stay as test.fixme until a context-usage indicator is
 * added to `ChatPanelEmbedded` (or any mounted component).
 */
import { test } from './fixtures';

test.describe('Feature: Context-usage indicator', () => {
  test.describe('Given a chat panel with no usage info', () => {
    test.fixme(
      'When context_usage {used, limit} fires below 80%, Then a neutral indicator shows the ratio',
      async () => {
        // context_usage is a KshanaEventName but no UI renders it.
        // This test pins a missing behavior — implement the indicator first.
      },
    );

    test.fixme(
      'When usage crosses 80%, Then a warning-tone indicator appears',
      async () => {
        // Same gap — no context-usage UI exists anywhere in the renderer.
      },
    );
  });
});
