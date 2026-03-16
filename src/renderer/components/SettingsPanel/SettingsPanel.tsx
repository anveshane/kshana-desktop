import { useEffect, useState } from 'react';
import type { AppSettings, ThemeId } from '../../../shared/settingsTypes';
import { DESKTOP_THEMES } from '../../themes';
import styles from './SettingsPanel.module.scss';

type SettingsTab = 'appearance' | 'connection';

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
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyuiTimeout: 1800,
  themeId: 'studio-neutral',
};

const LEGACY_LOCAL_COMFYUI_URL = 'http://localhost:8000';

function normalizeConnectionSettings(input: AppSettings | null): AppSettings {
  const next = input ?? emptySettings;
  const normalizedUrl = (next.comfyuiUrl || '').trim();
  const explicitMode = next.comfyuiMode;
  const derivedMode =
    explicitMode === 'custom' || explicitMode === 'inherit'
      ? explicitMode
      : !normalizedUrl || normalizedUrl === LEGACY_LOCAL_COMFYUI_URL
        ? 'inherit'
        : 'custom';

  const mode = derivedMode === 'custom' && !normalizedUrl ? 'inherit' : derivedMode;

  return {
    ...next,
    comfyuiMode: mode,
    comfyuiUrl: mode === 'custom' ? normalizedUrl : '',
    comfyuiTimeout: 1800,
  };
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

  useEffect(() => {
    setForm(normalizeConnectionSettings(settings));
  }, [settings, isVisible]);

  useEffect(() => {
    if (isVisible) {
      setActiveTab('appearance');
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
      comfyuiMode: normalized.comfyuiMode,
      comfyuiUrl: normalized.comfyuiUrl,
    });
  };

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

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
                ComfyUI backend configuration
              </span>
            </button>
          </aside>

          <form className={styles.form} onSubmit={handleSubmit}>
            <section className={styles.section}>
              {activeTab === 'appearance' ? (
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
                    <p>Configure ComfyUI server connectivity.</p>
                  </div>

                  <fieldset className={styles.fieldset}>
                    <legend>ComfyUI Source</legend>
                    <div className={styles.radios}>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          className={styles.radioInput}
                          name="comfyui-mode"
                          value="inherit"
                          checked={form.comfyuiMode === 'inherit'}
                          onChange={() => handleInput('comfyuiMode', 'inherit')}
                        />
                        Use backend default (`COMFYUI_BASE_URL`)
                      </label>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          className={styles.radioInput}
                          name="comfyui-mode"
                          value="custom"
                          checked={form.comfyuiMode === 'custom'}
                          onChange={() => handleInput('comfyuiMode', 'custom')}
                        />
                        Use custom URL override
                      </label>
                    </div>
                  </fieldset>

                  <label className={styles.label}>
                    ComfyUI URL
                    <input
                      type="url"
                      className={styles.input}
                      value={form.comfyuiUrl}
                      onChange={(event) =>
                        handleInput('comfyuiUrl', event.target.value)
                      }
                      placeholder="https://comfyui.share.zrok.io"
                      disabled={form.comfyuiMode !== 'custom'}
                      required={form.comfyuiMode === 'custom'}
                    />
                  </label>

                  {error && <div className={styles.error}>{error}</div>}
                </>
              )}
            </section>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onClose}
              >
                {isEmbedded ? 'Back to Projects' : 'Close'}
              </button>
              {activeTab === 'connection' && (
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isSavingConnection}
                >
                  {isSavingConnection ? 'Reconnecting…' : 'Save & Reconnect'}
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
