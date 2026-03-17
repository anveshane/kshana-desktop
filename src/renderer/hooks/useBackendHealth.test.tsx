import '@testing-library/jest-dom';
import { act, render } from '@testing-library/react';
import { useBackendHealth } from './useBackendHealth';

const setConnectionStatus = jest.fn();

jest.mock('../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    setConnectionStatus,
  }),
}));

function TestComponent() {
  useBackendHealth({
    comfyuiMode: 'inherit',
    comfyuiUrl: '',
    comfyuiTimeout: 1800,
    themeId: 'studio-neutral',
  });
  return null;
}

describe('useBackendHealth', () => {
  beforeEach(() => {
    setConnectionStatus.mockReset();
  });

  it('checks backend state once and then listens for state changes', async () => {
    let stateListener: ((state: { status: string }) => void) | null = null;
    const unsubscribe = jest.fn();

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        backend: {
          getState: jest.fn().mockResolvedValue({ status: 'ready' }),
          onStateChange: jest.fn((listener: (state: { status: string }) => void) => {
            stateListener = listener;
            return unsubscribe;
          }),
        },
      },
    });

    await act(async () => {
      render(<TestComponent />);
    });

    expect(window.electron.backend.getState).toHaveBeenCalledTimes(1);
    expect(window.electron.backend.onStateChange).toHaveBeenCalledTimes(1);
    expect(setConnectionStatus).toHaveBeenCalledWith('server', 'connected');

    act(() => {
      stateListener?.({ status: 'connecting' });
    });

    expect(setConnectionStatus).toHaveBeenCalledWith('server', 'connecting');
  });
});
