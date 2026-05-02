/**
 * Wave 2 — Landing screen, recent-projects flow.
 */
import { test } from './fixtures';

test.describe('Feature: Landing screen, recent projects', () => {
  test.describe('Given two recent projects seeded into the bridge', () => {
    test.fixme(
      'When the page boots, Then both project cards render with names + paths',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user clicks a project card, Then project.watchDirectory + project.addRecent are called with that path',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user clicks "Open project from disk", Then project.selectDirectory is called',
      async () => {
        // Implement.
      },
    );
  });
});
