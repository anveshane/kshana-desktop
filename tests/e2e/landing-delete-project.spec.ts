/**
 * Wave 2 — Delete-project flow from a recent-project card.
 */
import { test } from './fixtures';

test.describe('Feature: Delete a recent project', () => {
  test.describe('Given a recent project with a context menu', () => {
    test.fixme(
      'When the user opens the context menu and clicks Delete, Then a confirm dialog shows',
      async () => {
        // (?) — verify the actual entry point (context menu vs hover icon vs project page).
      },
    );

    test.fixme(
      'When the user confirms, Then project.deleteProject is called and the card disappears from the list',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user cancels, Then project.deleteProject is not called',
      async () => {
        // Implement.
      },
    );
  });
});
