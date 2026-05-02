/**
 * Wave 4 — Assets browser inside the Workspace surface.
 */
import { test } from './fixtures';

test.describe('Feature: Assets browser', () => {
  test.describe('Given a project with a file tree seeded into project.readTree', () => {
    test.fixme(
      'When the user opens the Assets tab, Then the file tree renders the seeded entries',
      async () => {
        // Implement — seed bridgeReturn 'project.readTree' with a minimal tree.
      },
    );

    test.fixme(
      'When the user clicks an asset, Then the preview pane shows it',
      async () => {
        // (?) — verify preview surface (image vs. video vs. text path).
      },
    );

    test.fixme(
      'When emitElectron fires project:file-change, Then the tree refreshes',
      async () => {
        // (?) — verify the renderer's response to file-change events.
      },
    );
  });
});
