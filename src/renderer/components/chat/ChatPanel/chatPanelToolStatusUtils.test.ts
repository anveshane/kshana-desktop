import { describe, expect, it } from '@jest/globals';

import {
  getPostToolUiState,
  getRemoteFsReconnectMessage,
} from './chatPanelToolStatusUtils';

describe('chatPanelToolStatusUtils', () => {
  it('maps remote filesystem disconnects to reconnect guidance', () => {
    expect(
      getRemoteFsReconnectMessage(
        'Remote project filesystem is not connected for file_mkdir_command',
      ),
    ).toBe(
      'Project connection was interrupted. Reconnect the chat, then retry the last step.',
    );
  });

  it('leaves the UI in error after a terminal tool failure', () => {
    expect(
      getPostToolUiState({
        toolStatus: 'error',
        currentAgentStatus: 'thinking',
        isTaskRunning: false,
        hasActiveQuestion: false,
        hasOtherActiveTools: false,
        toolMessage: 'generate_image failed',
      }),
    ).toEqual({
      agentStatus: 'error',
      statusMessage: 'generate_image failed',
      isTaskRunning: false,
    });
  });

  it('returns the UI to waiting when a question is active', () => {
    expect(
      getPostToolUiState({
        toolStatus: 'completed',
        currentAgentStatus: 'thinking',
        isTaskRunning: false,
        hasActiveQuestion: true,
        hasOtherActiveTools: false,
      }),
    ).toEqual({
      agentStatus: 'waiting',
      statusMessage: 'Waiting for your input',
      isTaskRunning: false,
    });
  });

  it('returns the UI to idle when a completed tool was the last stale thinking state', () => {
    expect(
      getPostToolUiState({
        toolStatus: 'completed',
        currentAgentStatus: 'thinking',
        isTaskRunning: false,
        hasActiveQuestion: false,
        hasOtherActiveTools: false,
      }),
    ).toEqual({
      agentStatus: 'idle',
      statusMessage: 'Ready',
      isTaskRunning: false,
    });
  });

  it('does not override the UI while a run is still active', () => {
    expect(
      getPostToolUiState({
        toolStatus: 'completed',
        currentAgentStatus: 'thinking',
        isTaskRunning: true,
        hasActiveQuestion: false,
        hasOtherActiveTools: false,
      }),
    ).toBeNull();
  });
});
