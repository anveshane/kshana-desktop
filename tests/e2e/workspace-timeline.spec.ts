/**
 * Wave 4 — Timeline panel inside the Workspace surface.
 *
 * The timeline reads scenes/shots from the project state. Tests will
 * either seed `project.readProjectSnapshot` via setBridgeReturn, or
 * drive timeline updates through scenario rules emitting
 * `timeline_update` events.
 */
import { test } from './fixtures';

test.describe('Feature: Timeline panel', () => {
  test.describe('Given a project with scenes + shots populated', () => {
    test.fixme(
      'When the timeline panel mounts, Then the scene/shot rows render in order',
      async () => {
        // (?) — verify against TimelinePanel.tsx; need to know the data path
        //       (snapshot file vs. event stream).
      },
    );

    test.fixme(
      'When the user clicks a shot row, Then the shot detail panel updates',
      async () => {
        // (?) — verify selector target and detail-panel surface.
      },
    );

    test.fixme(
      'When the user clicks Play, Then the playback indicator advances and Pause becomes available',
      async () => {
        // (?) — verify.
      },
    );
  });
});
