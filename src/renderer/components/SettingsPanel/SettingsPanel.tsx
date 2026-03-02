import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/settingsTypes';
import styles from './SettingsPanel.module.scss';

type Props = {
  isOpen: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void> | void;
  isRestarting: boolean;
  error?: string | null;
};

const emptySettings: AppSettings = {
  comfyuiMode: 'inherit',
  comfyuiUrl: '',
  comfyuiTimeout: 1800,
};

const LEGACY_LOCAL_COMFYUI_URL = 'http://localhost:8000';

function normalizeSettings(input: AppSettings | null): AppSettings {
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
  settings,
  onClose,
  onSave,
  isRestarting,
  error,
}: Props) {
  const [form, setForm] = useState<AppSettings>(normalizeSettings(settings));

  useEffect(() => {
    setForm(normalizeSettings(settings));
  }, [settings, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isRestarting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isRestarting, onClose]);

  if (!isOpen) {
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
    const normalized = normalizeSettings(form);
    await onSave(normalized);
  };

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2>Settings</h2>
            <p>Configure ComfyUI server connectivity.</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
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

          {error && (
            <div className={styles.error}>{error}</div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={isRestarting}
            >
              {isRestarting ? 'Reconnecting…' : 'Save & Reconnect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
