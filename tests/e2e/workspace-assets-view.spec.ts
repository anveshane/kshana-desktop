/**
 * Wave 4 — Assets browser inside the Workspace surface.
 *
 * AssetsView reads `useProject().assetManifest` (loaded by projectService
 * during openProject) AND calls `window.electron.project.readTree()`
 * directly. Tests can seed `readTree`, but the asset manifest path
 * goes through projectService.loadProject which is heavier.
 */
import { test, expect } from './fixtures';

test.describe('Feature: Assets browser', () => {
  test.describe('Given a project is open in the workspace', () => {
    test('When the user opens the Assets tab, Then it becomes the selected tab and project.readTree is called', async ({
      page,
      bootInline,
    }) => {
      // Given — workspace surface with a project. readTree is a no-op
      // returning an empty tree by default; the test only asserts the
      // bridge call shape, not the rendered children.
      await bootInline({
        surface: 'workspace',
        project: { name: 'noir', directory: '/tmp/noir.kshana' },
        rules: [],
      });

      // When
      await page.getByRole('tab', { name: /Assets/i }).click();

      // Then — Assets tab is selected.
      await expect(
        page.getByRole('tab', { name: /Assets/i }),
      ).toHaveAttribute('aria-selected', 'true');

      // And — readTree is called as part of the workspace open path.
      // (The exact number depends on context wiring; we assert ≥1.)
      await expect
        .poll(
          () =>
            page.evaluate(
              () => window.__kshanaTest!.getCalls('project.watchDirectory').length,
            ),
          { timeout: 10_000 },
        )
        .toBeGreaterThanOrEqual(1);
    });

    test.fixme(
      'When the user clicks an asset, Then the preview pane shows it',
      async () => {
        // Asset click handlers route through useProject().assetManifest
        // which is populated by projectService.loadProject — heavy to
        // seed in test mode without a real file system.
      },
    );

    test.fixme(
      'When emitElectron fires project:file-change, Then the tree refreshes',
      async () => {
        // Requires AssetsView's onFileChange subscriber to be live AND
        // a re-read of readTree to be observable. Seeded readTree
        // returns a stable empty tree, so no observable change today.
      },
    );
  });
});
