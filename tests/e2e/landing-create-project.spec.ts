/**
 * Wave 2 — New project creation flow on the landing screen.
 */
import { test } from './fixtures';

test.describe('Feature: Create new project', () => {
  test.describe('Given the new-project dialog is open', () => {
    test.fixme(
      'When the user fills name + picks a parent directory + submits, Then project.createFolder + project.addRecent are called with the right args',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user submits with an empty name, Then validation copy renders and createFolder is not called',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user picks a parent where the target name already exists, Then the duplicate-name error renders and createFolder is not called',
      async () => {
        // (?) — verify against NewProjectDialog. May need bridge.checkFileExists seeded true.
      },
    );
  });
});
