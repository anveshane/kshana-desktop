import { describe, expect, it } from '@jest/globals';
import { getDisconnectBannerMessage } from './chatPanelConnectionUtils';

describe('chatPanelConnectionUtils', () => {
  it('uses a neutral reconnect banner while the backend still reports ready', () => {
    expect(
      getDisconnectBannerMessage({
        status: 'ready',
        port: 8001,
        serverUrl: 'http://localhost:8001',
      }),
    ).toBe('Chat connection interrupted. Attempting to reconnect...');
  });

  it('uses the backend-lost banner when backend state is not ready', () => {
    expect(
      getDisconnectBannerMessage({
        status: 'disconnected',
        port: 8001,
      }),
    ).toBe('Connection to backend lost. Attempting to reconnect...');
  });
});
