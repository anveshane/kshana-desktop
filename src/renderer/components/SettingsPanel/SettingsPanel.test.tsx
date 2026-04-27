import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
jest.mock('react', () => jest.requireActual('react'));
import SettingsPanel from './SettingsPanel';

const accountGet = jest.fn();
const accountOnChange = jest.fn();

const baseSettings = {
  backendMode: 'local' as const,
  comfyuiMode: 'inherit' as const,
  comfyuiUrl: '',
  comfyCloudApiKey: '',
  comfyuiTimeout: 1800,
  llmProvider: 'openai' as const,
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
    accountGet.mockReset();
    accountOnChange.mockReset();
    accountGet.mockResolvedValue(null);
    accountOnChange.mockReturnValue(jest.fn());

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
        account: {
          get: accountGet,
          signIn: jest.fn().mockResolvedValue({ opened: true }),
          signOut: jest.fn().mockResolvedValue({ success: true }),
          refreshBalance: jest.fn().mockResolvedValue({ balance: null }),
          getBillingUrl: jest.fn().mockResolvedValue('https://kshana.example/billing'),
          openBilling: jest.fn().mockResolvedValue({
            opened: true,
            url: 'https://kshana.example/billing',
          }),
          onChange: accountOnChange,
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

    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.click(screen.getByText('Deep Forest & Gold'));
    expect(onThemeChange).toHaveBeenCalledWith('deep-forest-gold');
  });

  it('asks for confirmation before switching to cloud mode', async () => {
    accountGet.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      credits: 500,
      token: 'desktop-token',
    });
    const onSaveConnection = jest.fn().mockResolvedValue(true);

    await act(async () => {
      render(
        <SettingsPanel
          isOpen
          settings={baseSettings}
          onClose={jest.fn()}
          onThemeChange={jest.fn()}
          onSaveConnection={onSaveConnection}
          isSavingConnection={false}
          error={null}
        />,
      );
    });

    fireEvent.click(screen.getByText('Connection'));

    expect(screen.getByLabelText('ComfyUI URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Comfy Cloud API Key')).toBeInTheDocument();
    expect(screen.getByText('OpenAI-Compatible')).toBeInTheDocument();
    expect(screen.queryByText('LM Studio')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Cloud'));

    expect(screen.getByRole('dialog', { name: 'Switch to Cloud' })).toBeInTheDocument();
    expect(screen.getByLabelText('Local')).toBeChecked();
    expect(screen.queryByText('Managed Cloud Backend')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Save & Reconnect'));
    });

    expect(onSaveConnection).toHaveBeenCalledWith(
      expect.objectContaining({ backendMode: 'cloud' }),
    );
    expect(screen.getByLabelText('Cloud')).toBeChecked();
    expect(screen.getByLabelText('ComfyUI URL')).toBeDisabled();
    expect(screen.queryByText('Managed Cloud Backend')).not.toBeInTheDocument();
  });

  it('blocks switching to cloud mode when no account is signed in', async () => {
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
    fireEvent.click(screen.getByLabelText('Cloud'));

    expect(screen.getByLabelText('Local')).toBeChecked();
    expect(screen.getByLabelText('Cloud')).not.toBeChecked();
    expect(
      screen.getByText('Sign in to Kshana Cloud before switching to Cloud mode.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('ComfyUI URL')).toBeInTheDocument();
  });

  it('keeps the status card on the current backend until save is triggered', async () => {
    accountGet.mockResolvedValue({
      userId: 'user-1',
      email: 'user@example.com',
      credits: 500,
      token: 'desktop-token',
    });

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

    expect(screen.getByText('Connected to Local')).toBeInTheDocument();
    expect(screen.queryByText('http://127.0.0.1:8001')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Switch to Cloud' })).toBeInTheDocument();
    expect(screen.queryByText('Managed Cloud Backend')).not.toBeInTheDocument();
  });
});
