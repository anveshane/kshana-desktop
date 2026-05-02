/**
 * Wave 6 — Context-usage indicator reacts to token-usage events.
 */
import { test } from './fixtures';

test.describe('Feature: Context-usage indicator', () => {
  test.describe('Given a chat panel with no usage info', () => {
    test.fixme(
      'When context_usage {used, limit} fires below 80%, Then a neutral indicator shows the ratio',
      async () => {
        // (?) — verify whether the chat panel actually surfaces token usage in UI today.
        //       If not, this test pins a missing behavior — flag back.
      },
    );

    test.fixme(
      'When usage crosses 80%, Then a warning-tone indicator appears',
      async () => {
        // (?) — verify warning threshold and tone styling.
      },
    );
  });
});
