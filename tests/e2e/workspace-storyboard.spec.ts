/**
 * Wave 4 — Storyboard view inside the Workspace surface.
 *
 * StoryboardView reads `useProject().scenes` (populated by
 * projectService.openProject → readAgentState → readFile). When no
 * project data is seeded the component renders its "No Scenes Yet"
 * empty state, which is the observable outcome in the default harness.
 *
 * The "shot cards in scene order" test requires seeded project.json
 * data (readFile returning agent state JSON). That seeding is tracked
 * in the workspace-timeline / data-seeding work; once available both
 * tests will be fully live.
 */
import { test, expect } from './fixtures';

test.describe('Feature: Storyboard view', () => {
  test.describe('Given a project is open in the workspace', () => {
    test('When the user clicks the Storyboard tab, Then it becomes the selected tab and StoryboardView mounts', async ({
      page,
      bootInline,
    }) => {
      // Given
      await bootInline({
        surface: 'workspace',
        project: { name: 'noir', directory: '/tmp/noir.kshana' },
        rules: [],
      });

      // When
      await page.getByRole('tab', { name: /Storyboard/i }).click();

      // Then — tab is selected.
      await expect(
        page.getByRole('tab', { name: /Storyboard/i }),
      ).toHaveAttribute('aria-selected', 'true');

      // And — StoryboardView mounts. With no seeded scenes it shows
      // the empty state rather than crashing.
      await expect(
        page.getByText(/No Scenes Yet|No Project Open/i),
      ).toBeVisible();
    });
  });

  test.describe('Given a project with shots populated', () => {
    test.fixme(
      'When the user opens the Storyboard tab, Then shot cards render in scene order',
      async () => {
        // Requires seeding project.readFile to return agent-state JSON
        // with scenes so that ProjectContext.scenes is non-empty.
        // Blocked on readFile seeding support in the fake bridge.
      },
    );

    test.fixme(
      'When the user clicks a shot card, Then the shot opens in the detail view',
      async () => {
        // StoryboardView.handleExpand is a console.log stub — no
        // navigation or detail view is implemented yet.
      },
    );
  });
});
