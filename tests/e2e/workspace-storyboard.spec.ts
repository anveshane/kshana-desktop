/**
 * Wave 4 — Storyboard view inside the Workspace surface.
 *
 * **PRODUCT GAP discovered while writing this spec:** the Storyboard
 * tab is commented out in `PreviewPanel.tsx`:
 *
 *     // {activeTab === 'storyboard' && <StoryboardView />}
 *
 * The Tab union type still includes `'storyboard'` and the
 * `StoryboardView` component still exists on disk, but the tab list
 * passed to the renderer omits it. So there is no live UI path that
 * mounts StoryboardView today.
 *
 * Both cases stay as test.fixme until either:
 *   (a) the Storyboard tab is re-enabled in PreviewPanel.tsx, or
 *   (b) the dead StoryboardView code is deleted (and these specs
 *       deleted with it).
 *
 * Tracking this separately as a product cleanup item.
 */
import { test } from './fixtures';

test.describe('Feature: Storyboard view', () => {
  test.describe('Given a project with shots populated', () => {
    test.fixme(
      'When the user opens the Storyboard tab, Then shot cards render in scene order',
      async () => {
        // Storyboard tab is commented out in PreviewPanel.tsx.
        // Re-enable the tab or delete StoryboardView; this test
        // pins behavior that has no live entry point.
      },
    );

    test.fixme(
      'When the user clicks a shot card, Then the shot opens in the detail view',
      async () => {
        // Same gap — no entry point.
      },
    );
  });
});
