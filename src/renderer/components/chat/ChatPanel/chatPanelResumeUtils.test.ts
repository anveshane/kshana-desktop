import { describe, expect, it } from '@jest/globals';
import {
  getResumedSessionUiState,
  shouldConfigureProjectAfterConnect,
  type RemoteSessionInfo,
} from './chatPanelResumeUtils';

describe('chatPanelResumeUtils', () => {
  it('skips configure_project when reconnecting to an existing session', () => {
    const session: RemoteSessionInfo = {
      id: 'session-1',
      status: 'running',
    };

    expect(shouldConfigureProjectAfterConnect(session, false)).toBe(false);
    expect(shouldConfigureProjectAfterConnect(session, true)).toBe(false);
  });

  it('requires configure_project for new sessions unless already queued', () => {
    expect(shouldConfigureProjectAfterConnect(null, false)).toBe(true);
    expect(shouldConfigureProjectAfterConnect(null, true)).toBe(false);
  });

  it('maps running resumed sessions back into active-run UI', () => {
    expect(
      getResumedSessionUiState({
        id: 'session-1',
        status: 'running',
      }),
    ).toEqual({
      agentStatus: 'thinking',
      statusMessage: 'Reconnected to active session. Waiting for next update...',
      isTaskRunning: true,
      notice: 'Reconnected to active session.',
    });
  });
});
