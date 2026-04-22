import { useCallback, useEffect, useState } from 'react';
import type {
  BackendConnectionInfo,
  BackendState,
} from '../../../shared/backendTypes';
import type {
  AppSettings,
  LLMProvider,
  ThemeId,
} from '../../../shared/settingsTypes';
import { DESKTOP_THEMES } from '../../themes';
import styles from './SettingsPanel.module.scss';
import AccountTab from './AccountTab';

type SettingsTab = 'account' | 'appearance' | 'connection';

type Props = {
  isOpen: boolean;
  variant?: 'modal' | 'embedded';
  settings: AppSettings | null;
  onClose: () => void;
  onThemeChange: (themeId: ThemeId) => Promise<void> | void;
  onSaveConnection: (settings: Partial<AppSettings>) => Promise<boolean> | void;
  isSavingConnection: boolean;
  error?: string | null;
};

const emptySettings: AppSettings = {
  backendMode: 'local',
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyCloudApiKey: '',
  comfyuiTimeout: 1800,
  llmProvider: 'openai',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
  themeId: 'studio-neutral',
};

function withV1Suffix(url: string): string {
  return /\/v1\/?$/.test(url) ? url : `${url.replace(/\/$/, '')}/v1`;
}

function normalizeConnectionSettings(input: AppSettings | null): AppSettings {
  const next = input ?? emptySettings;
  const comfyuiUrl = (next.comfyuiUrl || '').trim();
  const backendMode = next.backendMode === 'cloud' ? 'cloud' : 'local';
  const llmProvider =
    next.llmProvider === 'openrouter' || next.llmProvider === 'lmstudio'
      ? 'openai'
      : next.llmProvider;
  const openaiApiKey =
    llmProvider === 'openai' && next.llmProvider === 'openrouter'
      ? next.openRouterApiKey || next.openaiApiKey
      : next.openaiApiKey;
  const openaiBaseUrl =
    llmProvider === 'openai' && next.llmProvider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : llmProvider === 'openai' && next.llmProvider === 'lmstudio'
        ? withV1Suffix(next.lmStudioUrl || emptySettings.lmStudioUrl)
        : next.openaiBaseUrl;
  const openaiModel =
    llmProvider === 'openai' && next.llmProvider === 'openrouter'
      ? next.openRouterModel || next.openaiModel
      : llmProvider === 'openai' && next.llmProvider === 'lmstudio'
        ? next.lmStudioModel || next.openaiModel
        : next.openaiModel;

  return {
    ...emptySettings,
    ...next,
    backendMode,
    llmProvider,
    comfyuiMode: comfyuiUrl ? 'custom' : 'inherit',
    comfyuiUrl,
    comfyCloudApiKey: next.comfyCloudApiKey ?? '',
    lmStudioUrl: next.lmStudioUrl?.trim() || emptySettings.lmStudioUrl,
    lmStudioModel: next.lmStudioModel?.trim() || emptySettings.lmStudioModel,
    googleApiKey: next.googleApiKey ?? '',
    geminiModel: next.geminiModel?.trim() || emptySettings.geminiModel,
    openaiApiKey: openaiApiKey ?? '',
    openaiBaseUrl: openaiBaseUrl?.trim() || emptySettings.openaiBaseUrl,
    openaiModel: openaiModel?.trim() || emptySettings.openaiModel,
    openRouterApiKey: next.openRouterApiKey ?? '',
    openRouterModel:
      next.openRouterModel?.trim() || emptySettings.openRouterModel,
  };
}

function formatStatusLabel(status?: string): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'starting':
      return 'Starting';
    case 'connecting':
      return 'Connecting';
    case 'error':
      return 'Error';
    case 'stopped':
      return 'Stopped';
    default:
      return 'Idle';
  }
}

function getStatusTone(
  status?: string,
): 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'starting':
    case 'connecting':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

export default function SettingsPanel({
  isOpen,
  variant = 'modal',
  settings,
  onClose,
  onThemeChange,
  onSaveConnection,
  isSavingConnection,
  error,
}: Props) {
  const isEmbedded = variant === 'embedded';
  const isVisible = isEmbedded || isOpen;
  const [form, setForm] = useState<AppSettings>(normalizeConnectionSettings(settings));
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [backendState, setBackendState] = useState<BackendState | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<BackendConnectionInfo | null>(null);

  useEffect(() => {
    setForm(normalizeConnectionSettings(settings));
  }, [settings, isVisible]);

  useEffect(() => {
    if (isVisible) {
      setActiveTab('account');
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isOpen || isEmbedded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSavingConnection) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSavingConnection, onClose, isEmbedded]);

  const refreshConnectionInfo = useCallback(async () => {
    try {
      const [state, info] = await Promise.all([
        window.electron.backend.getState(),
        window.electron.backend.getConnectionInfo(),
      ]);
      setBackendState(state);
      setConnectionInfo(info);
    } catch (nextError) {
      console.error('Failed to refresh backend connection info', nextError);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return undefined;

    void refreshConnectionInfo();

    return window.electron.backend.onStateChange((state) => {
      setBackendState(state);
      void refreshConnectionInfo();
    });
  }, [isVisible, refreshConnectionInfo]);

  if (!isVisible) {
    return null;
  }

  const handleInput = (
    key: keyof AppSettings,
    value: string | number | undefined,
  ) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = normalizeConnectionSettings(form);
    await onSaveConnection({
      backendMode: normalized.backendMode,
      comfyuiMode: normalized.comfyuiUrl ? 'custom' : 'inherit',
      comfyuiUrl: normalized.comfyuiUrl,
      comfyCloudApiKey: normalized.comfyCloudApiKey,
      llmProvider: normalized.llmProvider,
      lmStudioUrl: normalized.lmStudioUrl,
      lmStudioModel: normalized.lmStudioModel,
      googleApiKey: normalized.googleApiKey,
      geminiModel: normalized.geminiModel,
      openaiApiKey: normalized.openaiApiKey,
      openaiBaseUrl: normalized.openaiBaseUrl,
      openaiModel: normalized.openaiModel,
      openRouterApiKey: normalized.openRouterApiKey,
      openRouterModel: normalized.openRouterModel,
    });
    void refreshConnectionInfo();
  };

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const currentMode =
    connectionInfo?.selectedMode ??
    backendState?.mode ??
    settings?.backendMode ??
    form.backendMode;
  const isLocalMode = form.backendMode === 'local';
  const isCurrentLocalMode = currentMode === 'local';
  const statusLabel = formatStatusLabel(backendState?.status);
  const statusTone = getStatusTone(backendState?.status);
  const statusHeadline = isCurrentLocalMode
    ? backendState?.status === 'ready'
      ? 'Connected to Local'
      : backendState?.status === 'error'
        ? 'Local backend did not become ready'
        : 'Starting Local backend'
    : backendState?.status === 'ready'
      ? 'Connected to Cloud'
      : 'Connecting to Cloud';
  const statusSupportText = isCurrentLocalMode
    ? backendState?.status === 'error'
      ? 'Review the local provider settings below, then try Save & Restart again. You can switch to Cloud if you need to continue immediately.'
      : 'The app is currently using the local kshana-core server on localhost with the provider settings shown below.'
    : 'The app is currently using the managed cloud backend shipped with this build.';
  const submitLabel = isLocalMode
    ? isSavingConnection
      ? 'Restarting…'
      : 'Save & Restart'
    : isSavingConnection
      ? 'Reconnecting…'
      : 'Save & Reconnect';

  const renderProviderToggle = (
    provider: LLMProvider,
    label: string,
  ) => (
    <label className={styles.radioLabel}>
      <input
        type="radio"
        className={styles.radioInput}
        name="llm-provider"
        value={provider}
        checked={form.llmProvider === provider}
        onChange={(event) =>
          handleInput(
            'llmProvider',
            event.target.value as AppSettings['llmProvider'],
          )
        }
      />
      {label}
    </label>
  );

  const panelContent = (
    <div className={`${styles.panel} ${isEmbedded ? styles.embeddedPanel : ''}`}>
      <div className={styles.header}>
        <div>
          <h2>Settings</h2>
          <p>Adjust app preferences from one place.</p>
        </div>
        {!isEmbedded && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        )}
      </div>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'account' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <span className={styles.tabLabel}>Account</span>
            <span className={styles.tabDescription}>
              Kshana Cloud sign-in &amp; credits
            </span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'appearance' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <span className={styles.tabLabel}>Appearance</span>
            <span className={styles.tabDescription}>
              Themes and visual preferences
            </span>
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'connection' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('connection')}
          >
            <span className={styles.tabLabel}>Connection</span>
            <span className={styles.tabDescription}>
              Local and cloud backend configuration
            </span>
          </button>
        </aside>

        <form className={styles.form} onSubmit={handleSubmit}>
          <section className={styles.section}>
            {activeTab === 'account' ? (
              <AccountTab />
            ) : activeTab === 'appearance' ? (
              <>
                <div className={styles.sectionHeader}>
                  <h3>Appearance</h3>
                  <p>Choose a workspace palette tuned for long editing sessions.</p>
                </div>
                <div className={styles.themeGrid}>
                  {DESKTOP_THEMES.map((theme) => {
                    const isActive =
                      (settings?.themeId ?? emptySettings.themeId) === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        className={`${styles.themeCard} ${isActive ? styles.themeCardActive : ''}`}
                        onClick={() => onThemeChange(theme.id)}
                      >
                        <span className={styles.themePreview}>
                          {theme.swatches.map((swatch) => (
                            <span
                              key={swatch}
                              className={styles.themeSwatch}
                              style={{ backgroundColor: swatch }}
                            />
                          ))}
                        </span>
                        <span className={styles.themeMeta}>
                          <span className={styles.themeName}>{theme.name}</span>
                          <span className={styles.themeDescription}>
                            {theme.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className={styles.sectionHeader}>
                  <h3>Connection</h3>
                  <p>Choose where the desktop app connects.</p>
                </div>

                <div
                  className={`${styles.statusCard} ${
                    statusTone === 'warning'
                        ? styles.statusCardWarning
                        : statusTone === 'error'
                          ? styles.statusCardError
                          : ''
                  }`}
                >
                  <div className={styles.statusTopRow}>
                    <div>
                      <div
                        className={`${styles.statusHeader} ${
                          statusTone === 'error'
                              ? styles.statusHeaderError
                              : ''
                        }`}
                      >
                        Connection Status
                      </div>
                      <div
                        className={`${styles.statusHeadline} ${
                          statusTone === 'error'
                              ? styles.statusHeadlineError
                              : ''
                        }`}
                      >
                        {statusHeadline}
                      </div>
                      <p className={styles.statusSupportText}>{statusSupportText}</p>
                      {/* Intentionally do not display internal cloud endpoint URL. */}
                    </div>
                    <div className={`${styles.statusBadge} ${styles[`statusBadge${statusTone.charAt(0).toUpperCase()}${statusTone.slice(1)}`]}`}>
                      <span className={styles.statusDot} />
                      {statusLabel}
                    </div>
                  </div>
                  {backendState?.message && (
                    <div className={styles.statusGrid}>
                      <div className={styles.statusItemFull}>
                        <span className={styles.statusLabel}>Details</span>
                        <span className={styles.statusMessage}>{backendState.message}</span>
                      </div>
                    </div>
                  )}
                </div>

                <fieldset className={`${styles.fieldset} ${styles.modeFieldset}`}>
                  <legend>Backend Mode</legend>
                  <div className={styles.modeSwitch} role="radiogroup" aria-label="Backend Mode">
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        className={styles.radioInput}
                        name="backend-mode"
                        value="local"
                        checked={form.backendMode === 'local'}
                        onChange={() => handleInput('backendMode', 'local')}
                      />
                      <span className={styles.modeOption}>Local</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        className={styles.radioInput}
                        name="backend-mode"
                        value="cloud"
                        checked={form.backendMode === 'cloud'}
                        onChange={() => handleInput('backendMode', 'cloud')}
                      />
                      <span className={styles.modeOption}>Cloud</span>
                    </label>
                  </div>
                </fieldset>

                {isLocalMode ? (
                  <>
                    <label className={styles.label}>
                      ComfyUI URL
                      <input
                        type="url"
                        className={styles.input}
                        value={form.comfyuiUrl}
                        onChange={(event) =>
                          handleInput('comfyuiUrl', event.target.value)
                        }
                        placeholder="http://localhost:8000"
                      />
                    </label>

                    <label className={styles.label}>
                      Comfy Cloud API Key
                      <input
                        type="password"
                        className={styles.input}
                        value={form.comfyCloudApiKey}
                        onChange={(event) =>
                          handleInput('comfyCloudApiKey', event.target.value)
                        }
                        placeholder="Only used for https://cloud.comfy.org"
                      />
                    </label>
                    <p className={styles.infoText}>
                      This key is only used when the ComfyUI URL points to
                      `https://cloud.comfy.org`. Local and self-hosted ComfyUI
                      connections ignore it.
                    </p>

                    <fieldset className={styles.fieldset}>
                      <legend>LLM Provider</legend>
                      <div className={styles.radios}>
                        {renderProviderToggle('gemini', 'Gemini')}
                        {renderProviderToggle('openai', 'OpenAI-Compatible')}
                      </div>
                    </fieldset>

                    {form.llmProvider === 'gemini' && (
                      <>
                        <label className={styles.label}>
                          Google API Key
                          <input
                            type="password"
                            className={styles.input}
                            value={form.googleApiKey}
                            onChange={(event) =>
                              handleInput('googleApiKey', event.target.value)
                            }
                            placeholder="AIza..."
                          />
                        </label>

                        <label className={styles.label}>
                          Gemini Model ID
                          <input
                            type="text"
                            className={styles.input}
                            value={form.geminiModel}
                            onChange={(event) =>
                              handleInput('geminiModel', event.target.value)
                            }
                            placeholder="gemini-2.5-flash"
                          />
                        </label>
                      </>
                    )}

                    {form.llmProvider === 'openai' && (
                      <>
                        <label className={styles.label}>
                          API Key
                          <input
                            type="password"
                            className={styles.input}
                            value={form.openaiApiKey}
                            onChange={(event) =>
                              handleInput('openaiApiKey', event.target.value)
                            }
                            placeholder="sk-..."
                          />
                        </label>

                        <label className={styles.label}>
                          Base URL
                          <input
                            type="url"
                            className={styles.input}
                            value={form.openaiBaseUrl}
                            onChange={(event) =>
                              handleInput('openaiBaseUrl', event.target.value)
                            }
                            placeholder="https://api.openai.com/v1"
                          />
                        </label>

                        <label className={styles.label}>
                          Model ID
                          <input
                            type="text"
                            className={styles.input}
                            value={form.openaiModel}
                            onChange={(event) =>
                              handleInput('openaiModel', event.target.value)
                            }
                            placeholder="gpt-4o"
                          />
                        </label>
                        <p className={styles.infoText}>
                          Use the default OpenAI URL, or point this at another OpenAI-compatible provider such as OpenRouter by changing the base URL.
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <div className={styles.infoCard}>
                    <div className={styles.infoTitle}>Managed Cloud Backend</div>
                    <p className={styles.infoText}>
                      The cloud backend URL is injected at release time and is not editable in the desktop app.
                    </p>
                    {connectionInfo?.note && (
                      <p className={styles.infoText}>{connectionInfo.note}</p>
                    )}
                  </div>
                )}

                {error && <div className={styles.error}>{error}</div>}
              </>
            )}
          </section>

          <div className={styles.actions}>
            {activeTab !== 'account' && (
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
              >
                {isEmbedded ? 'Back to Projects' : 'Close'}
              </button>
            )}
            {activeTab === 'connection' && (
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSavingConnection}
              >
                {submitLabel}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );

  if (isEmbedded) {
    return panelContent;
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      {panelContent}
    </div>
  );
}
