/**
 * Wave 5 — Redo a tool call from a completed tool card.
 *
 * **COMPONENT GAP:** `redoNode` is available via `useKshanaSession`
 * and is called via `window.kshana.redoNode` in the hook. However,
 * `ChatPanelEmbedded`'s `MessageRow` for `role === 'tool'` renders
 * only a compact one-liner (glyph + tool name + args); it has no
 * Redo button or affordance. The legacy `ToolCallCard` component has
 * no Redo button either.
 *
 * This case stays as test.fixme until a Redo affordance is added to
 * either `ChatPanelEmbedded` or a card component it renders.
 */
import { test } from './fixtures';

test.describe('Feature: Redo tool node', () => {
  test.describe('Given a completed tool card with a nodeId', () => {
    test.fixme(
      'When the user clicks Redo on the card, Then redoNode is called with that nodeId',
      async () => {
        // No Redo button in ChatPanelEmbedded tool rows or ToolCallCard.
        // redoNode is wired in useKshanaSession but has no UI entry point.
      },
    );
  });
});
