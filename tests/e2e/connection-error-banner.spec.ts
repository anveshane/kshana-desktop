/**
 * Wave 6 — Connection-error banner inside the workspace surface.
 *
 * **COMPONENT GAP:** There is no top-level error banner in the
 * workspace layout for backend connection errors. The only place a
 * backend:state error is surfaced is inside `SettingsPanel.tsx` (the
 * Connection tab status card), which is already covered by
 * `settings-backend-status.spec.ts`.
 *
 * The legacy `ChatPanel` has `appendConnectionBanner` which adds an
 * in-chat system message, but `ChatPanelEmbedded` (the currently
 * mounted panel) has no `backend:state` subscription at all.
 *
 * Both cases stay as test.fixme until either a top-level workspace
 * error banner is added, or `ChatPanelEmbedded` subscribes to
 * `backend:state` and surfaces connection errors inline.
 */
import { test } from './fixtures';

test.describe('Feature: Connection error surfacing', () => {
  test.describe('Given backend state is "ready" inside the workspace', () => {
    test.fixme(
      'When backend:state {status: "error", message: "X"} fires, Then an error banner appears with the message',
      async () => {
        // No top-level workspace error banner exists.
        // SettingsPanel status card (covered in settings-backend-status.spec.ts)
        // is the only backend-error surface today.
      },
    );

    test.fixme(
      'When state returns to "ready" afterward, Then the banner clears',
      async () => {
        // Same gap — no dismissible banner to clear.
      },
    );
  });
});
