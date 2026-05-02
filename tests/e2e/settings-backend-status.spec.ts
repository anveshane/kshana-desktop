/**
 * Wave 3 — Backend status display on the Settings → Connection tab.
 *
 * Drives the renderer via `emitElectron('backend:state', ...)` and asserts
 * the status card reacts.
 */
import { test } from './fixtures';

test.describe('Feature: Backend status display', () => {
  test.describe('Given the Connection tab is visible', () => {
    test.fixme(
      'When backend:state {status: "ready"} fires, Then "Connected to Local" headline + success-tone badge render',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When backend:state {status: "error", message: "X"} fires, Then error tone + the message render',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When backend:state {status: "connecting"} fires, Then "Starting Local backend" headline renders',
      async () => {
        // Implement.
      },
    );
  });
});
