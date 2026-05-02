/**
 * Wave 6 — Connection-error banner inside the workspace surface.
 */
import { test } from './fixtures';

test.describe('Feature: Connection error surfacing', () => {
  test.describe('Given backend state is "ready" inside the workspace', () => {
    test.fixme(
      'When backend:state {status: "error", message: "X"} fires, Then an error banner appears with the message',
      async () => {
        // (?) — verify whether there's a top-level error banner, or only the Settings status card,
        //       outside the Settings tab.
      },
    );

    test.fixme(
      'When state returns to "ready" afterward, Then the banner clears',
      async () => {
        // Implement.
      },
    );
  });
});
