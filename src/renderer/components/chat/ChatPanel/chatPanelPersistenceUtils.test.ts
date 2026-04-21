import {
  isChatRestoreCompleteForProject,
  shouldAutoConnectChat,
  shouldPersistChatSnapshot,
  type ChatRestoreState,
} from './chatPanelPersistenceUtils';

describe('chatPanelPersistenceUtils', () => {
  const restoringState: ChatRestoreState = {
    projectDirectory: '/tmp/project-a',
    status: 'restoring',
  };

  const restoredState: ChatRestoreState = {
    projectDirectory: '/tmp/project-a',
    status: 'restored',
  };

  const missingState: ChatRestoreState = {
    projectDirectory: '/tmp/project-a',
    status: 'missing',
  };

  it('does not allow snapshot persistence before restore completes', () => {
    expect(
      shouldPersistChatSnapshot({
        currentProjectDirectory: '/tmp/project-a',
        targetProjectDirectory: '/tmp/project-a',
        restoreState: restoringState,
      }),
    ).toBe(false);
  });

  it('allows snapshot persistence once a snapshot was restored', () => {
    expect(
      shouldPersistChatSnapshot({
        currentProjectDirectory: '/tmp/project-a',
        targetProjectDirectory: '/tmp/project-a',
        restoreState: restoredState,
      }),
    ).toBe(true);
  });

  it('allows snapshot persistence when restore completed with no saved history', () => {
    expect(
      shouldPersistChatSnapshot({
        currentProjectDirectory: '/tmp/project-a',
        targetProjectDirectory: '/tmp/project-a',
        restoreState: missingState,
      }),
    ).toBe(true);
  });

  it('rejects stale or mismatched project persistence attempts', () => {
    expect(
      shouldPersistChatSnapshot({
        currentProjectDirectory: '/tmp/project-b',
        targetProjectDirectory: '/tmp/project-a',
        restoreState: restoredState,
      }),
    ).toBe(false);

    expect(
      shouldPersistChatSnapshot({
        currentProjectDirectory: '/tmp/project-a',
        targetProjectDirectory: '/tmp/project-a',
        restoreState: {
          projectDirectory: '/tmp/project-b',
          status: 'restored',
        },
      }),
    ).toBe(false);
  });

  it('only allows auto-connect after restore is settled for the active project', () => {
    expect(
      shouldAutoConnectChat({
        projectDirectory: '/tmp/project-a',
        restoreState: restoringState,
      }),
    ).toBe(false);

    expect(
      shouldAutoConnectChat({
        projectDirectory: '/tmp/project-a',
        restoreState: restoredState,
      }),
    ).toBe(true);
  });

  it('reports restore completion only for matching projects', () => {
    expect(
      isChatRestoreCompleteForProject(restoredState, '/tmp/project-a'),
    ).toBe(true);
    expect(
      isChatRestoreCompleteForProject(restoredState, '/tmp/project-b'),
    ).toBe(false);
  });
});
