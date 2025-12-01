import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/settingsTypes';
import styles from './SettingsPanel.module.scss';

type Props = {
  isOpen: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void> | void;
  isRestarting: boolean;
};

const emptySettings: AppSettings = {
  comfyuiUrl: 'http://localhost:8000',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  llmProvider: 'lmstudio',
  googleApiKey: '',
};

export default function SettingsPanel({
  isOpen,
  settings,
  onClose,
  onSave,
  isRestarting,
}: Props) {
  const [form, setForm] = useState<AppSettings>(settings ?? emptySettings);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
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
    await onSave(form);
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
            <h2>Runtime settings</h2>
            <p>Values apply to the bundled backend at the next restart.</p>
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
              required
            />
          </label>

          <label className={styles.label}>
            LM Studio URL
            <input
              type="url"
              className={styles.input}
              value={form.lmStudioUrl}
              onChange={(event) =>
                handleInput('lmStudioUrl', event.target.value)
              }
              placeholder="http://127.0.0.1:1234"
              required
            />
          </label>

          <label className={styles.label}>
            LM Studio Model ID
            <input
              type="text"
              className={styles.input}
              value={form.lmStudioModel}
              onChange={(event) =>
                handleInput('lmStudioModel', event.target.value)
              }
              placeholder="qwen3"
              required
            />
          </label>

          <label className={styles.label}>
            Preferred backend port
            <input
              type="number"
              className={styles.input}
              min={1025}
              max={65535}
              value={form.preferredPort ?? ''}
              onChange={(event) =>
                handleInput(
                  'preferredPort',
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
              placeholder="8001"
            />
          </label>

          <fieldset className={styles.fieldset}>
            <legend>LLM Provider</legend>
            <div className={styles.radios}>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  className={styles.radioInput}
                  name="llm-provider"
                  value="lmstudio"
                  checked={form.llmProvider === 'lmstudio'}
                  onChange={(event) =>
                    handleInput(
                      'llmProvider',
                      event.target.value as AppSettings['llmProvider'],
                    )
                  }
                />
                LM Studio (local)
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  className={styles.radioInput}
                  name="llm-provider"
                  value="gemini"
                  checked={form.llmProvider === 'gemini'}
                  onChange={(event) =>
                    handleInput(
                      'llmProvider',
                      event.target.value as AppSettings['llmProvider'],
                    )
                  }
                />
                Gemini (cloud)
              </label>
            </div>
          </fieldset>

          {form.llmProvider === 'gemini' && (
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
                required
              />
            </label>
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
              {isRestarting ? 'Applying…' : 'Save & Restart'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

