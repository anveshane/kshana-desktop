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
  serverUrl: 'http://localhost:8001',
  comfyuiUrl: 'http://localhost:8000',
  lmStudioUrl: 'http://127.0.0.1:1234',
  lmStudioModel: 'qwen3',
  llmProvider: 'lmstudio',
  googleApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o',
  openRouterApiKey: '',
  openRouterModel: 'z-ai/glm-4.7-flash',
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
            <h2>Settings</h2>
            <p>Configure the backend server connection.</p>
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
            Backend URL
            <input
              type="url"
              className={styles.input}
              value={form.serverUrl}
              onChange={(event) =>
                handleInput('serverUrl', event.target.value)
              }
              placeholder="http://localhost:8001"
              required
            />
          </label>

          {/* TODO: Re-enable when needed
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
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  className={styles.radioInput}
                  name="llm-provider"
                  value="openai"
                  checked={form.llmProvider === 'openai'}
                  onChange={(event) =>
                    handleInput(
                      'llmProvider',
                      event.target.value as AppSettings['llmProvider'],
                    )
                  }
                />
                OpenAI (cloud)
              </label>
              <label className={styles.radioLabel}>
                <input
                  type="radio"
                  className={styles.radioInput}
                  name="llm-provider"
                  value="openrouter"
                  checked={form.llmProvider === 'openrouter'}
                  onChange={(event) =>
                    handleInput(
                      'llmProvider',
                      event.target.value as AppSettings['llmProvider'],
                    )
                  }
                />
                OpenRouter (cloud)
              </label>
            </div>
          </fieldset>

          {form.llmProvider === 'lmstudio' && (
            <>
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
            </>
          )}

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
                  required
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
                  required
                />
              </label>
            </>
          )}

          {form.llmProvider === 'openai' && (
            <>
              <label className={styles.label}>
                OpenAI API Key
                <input
                  type="password"
                  className={styles.input}
                  value={form.openaiApiKey}
                  onChange={(event) =>
                    handleInput('openaiApiKey', event.target.value)
                  }
                  placeholder="sk-..."
                  required
                />
              </label>
              <label className={styles.label}>
                OpenAI Base URL
                <input
                  type="url"
                  className={styles.input}
                  value={form.openaiBaseUrl}
                  onChange={(event) =>
                    handleInput('openaiBaseUrl', event.target.value)
                  }
                  placeholder="https://api.openai.com/v1"
                  required
                />
              </label>
              <label className={styles.label}>
                OpenAI Model ID
                <input
                  type="text"
                  className={styles.input}
                  value={form.openaiModel}
                  onChange={(event) =>
                    handleInput('openaiModel', event.target.value)
                  }
                  placeholder="gpt-4o"
                  required
                />
              </label>
            </>
          )}

          {form.llmProvider === 'openrouter' && (
            <>
              <label className={styles.label}>
                OpenRouter API Key
                <input
                  type="password"
                  className={styles.input}
                  value={form.openRouterApiKey}
                  onChange={(event) =>
                    handleInput('openRouterApiKey', event.target.value)
                  }
                  placeholder="sk-or-v1-..."
                  required
                />
              </label>
              <label className={styles.label}>
                OpenRouter Model ID
                <input
                  type="text"
                  className={styles.input}
                  value={form.openRouterModel}
                  onChange={(event) =>
                    handleInput('openRouterModel', event.target.value)
                  }
                  placeholder="z-ai/glm-4.7-flash"
                  required
                />
              </label>
            </>
          )}
          */}

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
