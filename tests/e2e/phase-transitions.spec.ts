/**
 * Wave 6 — Phase indicator reacts to phase_transition events.
 */
import { test } from './fixtures';

test.describe('Feature: Phase indicator', () => {
  test.describe('Given a chat panel with no active phase', () => {
    test.fixme(
      'When phase_transition events fire, Then the phase indicator updates to each new phase in order',
      async () => {
        // (?) — verify phase indicator selector + which phase names are shown.
      },
    );

    test.fixme(
      'When the final phase emits "completed", Then the indicator clears or shows the completed state',
      async () => {
        // (?) — verify terminal-state behavior.
      },
    );
  });
});
