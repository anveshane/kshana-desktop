import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
jest.mock('react', () => jest.requireActual('react'));
import SettingsPanel from './SettingsPanel';

const baseSettings = {
  backendMode: 'local' as const,
  comfyuiMode: 'inherit' as const,
  comfyuiUrl: '',
  comfyCloudApiKey: '',
  comfyuiTimeout: 1800,
  llmProvider: 'lmstudio' as const,
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  themeId: 'studio-neutral' as const,
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        backend: {
          getState: jest.fn().mockResolvedValue({ status: 'ready', serverUrl: 'http://127.0.0.1:8001' }),
          getConnectionInfo: jest.fn().mockResolvedValue({
            selectedMode: 'local',
            effectiveServerUrl: 'http://127.0.0.1:8001',
            cloudServerUrl: 'https://cloud.example.com',
            localServerUrl: 'http://127.0.0.1:8001',
            localBackendAvailable: true,
            bundledVersion: {
              packageVersion: '0.1.0',
              gitBranch: 'main',
              gitCommit: 'abcdef1234567',
            },
          }),
          onStateChange: jest.fn(() => jest.fn()),
        },
      },
    });
  });

  it('calls onThemeChange when a theme card is selected', async () => {
    const onThemeChange = jest.fn();

    await act(async () => {
      render(
        <SettingsPanel
          isOpen
          settings={baseSettings}
          onClose={jest.fn()}
          onThemeChange={onThemeChange}
          onSaveConnection={jest.fn()}
          isSavingConnection={false}
          error={null}
        />,
      );
    });

    fireEvent.click(screen.getByText('Deep Forest & Gold'));
    expect(onThemeChange).toHaveBeenCalledWith('deep-forest-gold');
  });

  it('shows local provider fields and switches to read-only cloud details', async () => {
    await act(async () => {
      render(
        <SettingsPanel
          isOpen
          settings={baseSettings}
          onClose={jest.fn()}
          onThemeChange={jest.fn()}
          onSaveConnection={jest.fn()}
          isSavingConnection={false}
          error={null}
        />,
      );
    });

    fireEvent.click(screen.getByText('Connection'));

    expect(screen.getByLabelText('ComfyUI URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Comfy Cloud API Key')).toBeInTheDocument();
    expect(screen.getByText('LM Studio')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cloud'));

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://cloud.example.com')).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText('ComfyUI URL')).not.toBeInTheDocument();
    expect(screen.getByText('Managed Cloud Backend')).toBeInTheDocument();
  });

  it('keeps the status card on the current backend until save is triggered', async () => {
    await act(async () => {
      render(
        <SettingsPanel
          isOpen
          settings={baseSettings}
          onClose={jest.fn()}
          onThemeChange={jest.fn()}
          onSaveConnection={jest.fn()}
          isSavingConnection={false}
          error={null}
        />,
      );
    });

    fireEvent.click(screen.getByText('Connection'));

    expect(screen.getByText('Connected to Local')).toBeInTheDocument();
    expect(screen.queryByText('http://127.0.0.1:8001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cloud'));

    await waitFor(() =>
      expect(screen.getByDisplayValue('https://cloud.example.com')).toBeInTheDocument(),
    );

    expect(screen.getByText('Connected to Local')).toBeInTheDocument();
    expect(screen.queryByText('http://127.0.0.1:8001')).not.toBeInTheDocument();
  });
});
