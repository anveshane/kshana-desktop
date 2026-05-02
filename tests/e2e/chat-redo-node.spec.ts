/**
 * Wave 5 — Redo a tool call from a completed tool card.
 */
import { test } from './fixtures';

test.describe('Feature: Redo tool node', () => {
  test.describe('Given a completed tool card with a nodeId', () => {
    test.fixme(
      'When the user clicks Redo on the card, Then redoNode is called with that nodeId',
      async () => {
        // (?) — verify the tool card actually exposes a Redo affordance and which event
        //       payload carries the nodeId.
      },
    );
  });
});
