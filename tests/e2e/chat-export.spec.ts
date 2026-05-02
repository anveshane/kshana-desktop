/**
 * Wave 7 — Export chat as JSON.
 *
 * **COMPONENT GAP:** The "Export Chat" button (aria-label="Export chat
 * history as JSON") is rendered in the legacy WebSocket-backed
 * `ChatPanel` header (ChatPanel.tsx:4855). `ChatPanelEmbedded` — the
 * panel mounted in both the `chat` and `workspace` test surfaces —
 * has no export button and no `handleExportChat` logic.
 *
 * This case stays as test.fixme until `ChatPanelEmbedded` gains an
 * export affordance or a test surface mounts the full `ChatPanel`.
 */
import { test } from './fixtures';

test.describe('Feature: Export chat JSON', () => {
  test.describe('Given an active chat session with messages', () => {
    test.fixme(
      'When the user clicks the Export action, Then project.exportChatJson is called with the current session payload',
      async () => {
        // Export button is in legacy ChatPanel (ChatPanel.tsx:4855),
        // not in ChatPanelEmbedded. No export affordance in any test surface.
      },
    );
  });
});
