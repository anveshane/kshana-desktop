/**
 * Wave 7 — Manifest-watcher reaction.
 *
 * **HARNESS GAP:** The `onManifestWritten` subscription in
 * `ProjectContext.tsx` only activates when `isImageSyncV2Enabled`
 * is true (localStorage `renderer.image_sync_v2 === 'true'`) AND a
 * project directory is set. When the event fires it calls
 * `projectService.readAssetManifest()` which delegates to
 * `window.electron.project.readFile()` — but that bridge call is
 * NOT recorded by the fake bridge (it returns null silently), so
 * there is no observable side-effect to assert on in tests today.
 *
 * This case stays as test.fixme until either:
 *   (a) `project.readFile` is recorded by the fake bridge, or
 *   (b) the manifest handler produces a directly observable DOM
 *       change (e.g. an asset count that can be asserted via
 *       a seeded readFile return).
 */
import { test } from './fixtures';

test.describe('Feature: Manifest watch reaction', () => {
  test.describe('Given the project is open and onManifestWritten is subscribed', () => {
    test.fixme(
      'When emitElectron fires project:manifest-written, Then the relevant UI re-reads',
      async () => {
        // project.readFile is not recorded by the fake bridge — the
        // readAssetManifest call triggered by the event has no observable
        // side-effect in the current harness.
      },
    );
  });
});
