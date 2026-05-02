/**
 * Wave 4 — PreviewPanel tab navigation inside the Workspace surface.
 */
import { test } from './fixtures';

test.describe('Feature: Preview-panel tab navigation', () => {
  test.describe('Given a project is open in the workspace', () => {
    test.fixme(
      'When the user clicks each preview tab in turn, Then the corresponding view is the only one rendered',
      async () => {
        // (?) — verify exact tab labels and rendered-view assertions against PreviewPanel.tsx.
      },
    );

    test.fixme(
      'When the user re-clicks the active tab, Then the view does not unmount',
      async () => {
        // Implement.
      },
    );
  });
});
