/**
 * Wave 6 — Phase indicator reacts to phase_transition events.
 *
 * **COMPONENT GAP:** The phase transition banner is rendered in
 * `MessageList.tsx` (inside the legacy WebSocket-backed `ChatPanel`).
 * The banner fires when a message carries `_phaseTransition` metadata
 * — a shape populated by ChatPanel's streaming pipeline. Neither
 * `ChatPanelEmbedded` nor its `handleEvent` function has any
 * `phase_transition` handling.
 *
 * Both cases stay as test.fixme until `ChatPanelEmbedded` surfaces
 * phase transitions or a test surface mounts the full `ChatPanel` +
 * `MessageList`.
 */
import { test } from './fixtures';

test.describe('Feature: Phase indicator', () => {
  test.describe('Given a chat panel with no active phase', () => {
    test.fixme(
      'When phase_transition events fire, Then the phase indicator updates to each new phase in order',
      async () => {
        // Phase banner is in MessageList (full ChatPanel only).
        // ChatPanelEmbedded.handleEvent has no phase_transition case.
      },
    );

    test.fixme(
      'When the final phase emits "completed", Then the indicator clears or shows the completed state',
      async () => {
        // Same gap.
      },
    );
  });
});
