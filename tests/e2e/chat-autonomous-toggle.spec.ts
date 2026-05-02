/**
 * Wave 5 — Autonomous mode toggle in the chat panel.
 *
 * **COMPONENT GAP:** The AUTO toggle button (`aria-pressed`, title=
 * "Toggle autonomous mode") lives in the legacy WebSocket-backed
 * `ChatPanel`. `ChatPanelEmbedded` — mounted in both the `chat` and
 * `workspace` test surfaces — has no such button. `useKshanaSession`
 * exposes `setAutonomous()` but there is no UI affordance in the
 * embedded panel to invoke it.
 *
 * Both cases stay as test.fixme until `ChatPanelEmbedded` gains an
 * autonomous toggle or a test surface mounts the full `ChatPanel`.
 */
import { test } from './fixtures';

test.describe('Feature: Autonomous mode toggle', () => {
  test.describe('Given the chat panel with autonomous off', () => {
    test.fixme(
      'When the user toggles autonomous on, Then setAutonomous is called with {autonomous: true}',
      async () => {
        // AUTO button is in legacy ChatPanel, not in ChatPanelEmbedded.
        // No autonomous toggle affordance in any current test surface.
      },
    );

    test.fixme(
      'When the user toggles autonomous off again, Then setAutonomous is called with {autonomous: false}',
      async () => {
        // Same gap.
      },
    );
  });
});
