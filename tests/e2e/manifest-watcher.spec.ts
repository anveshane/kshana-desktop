/**
 * Wave 7 — Manifest-watcher reaction.
 */
import { test } from './fixtures';

test.describe('Feature: Manifest watch reaction', () => {
  test.describe('Given the project is open and onManifestWritten is subscribed', () => {
    test.fixme(
      'When emitElectron fires project:manifest-written, Then the relevant UI re-reads',
      async () => {
        // (?) — verify which UI surface re-reads on manifest-written events.
      },
    );
  });
});
