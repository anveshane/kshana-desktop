import '@testing-library/jest-dom';
import { act, render } from '@testing-library/react';
jest.mock('react', () => jest.requireActual('react'));
jest.mock('../renderer/components/layout/WorkspaceLayout/WorkspaceLayout', () => () => null);
jest.mock('../renderer/components/landing/LandingScreen/LandingScreen', () => () => null);
import App from '../renderer/App';

describe('App', () => {
  it('should render', async () => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        settings: {
          get: jest.fn().mockResolvedValue({
            comfyuiMode: 'inherit',
            comfyuiUrl: '',
            comfyuiTimeout: 1800,
            themeId: 'studio-neutral',
          }),
          update: jest.fn(),
          onChange: jest.fn(() => jest.fn()),
        },
        backend: {
          getState: jest.fn().mockResolvedValue({ status: 'disconnected' }),
          onStateChange: jest.fn(() => jest.fn()),
        },
        project: {
          watchDirectory: jest.fn().mockResolvedValue(undefined),
          getRecentProjects: jest.fn().mockResolvedValue([]),
        },
        app: {
          getVersion: jest.fn().mockResolvedValue('1.0.9'),
        },
        ipcRenderer: {
          once: jest.fn(),
          sendMessage: jest.fn(),
        },
      },
    });

    let rendered: ReturnType<typeof render> | null = null;

    await act(async () => {
      rendered = render(<App />);
    });

    expect(rendered).toBeTruthy();
  });
});
