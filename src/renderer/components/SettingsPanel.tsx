import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/settingsTypes';

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

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <div>
            <h2>Runtime settings</h2>
            <p>Values apply to the bundled backend at the next restart.</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="settings-form" onSubmit={handleSubmit}>
          <label>
            ComfyUI URL
            <input
              type="url"
              value={form.comfyuiUrl}
              onChange={(event) =>
                handleInput('comfyuiUrl', event.target.value)
              }
              placeholder="http://localhost:8000"
              required
            />
          </label>

          <label>
            LM Studio URL
            <input
              type="url"
              value={form.lmStudioUrl}
              onChange={(event) =>
                handleInput('lmStudioUrl', event.target.value)
              }
              placeholder="http://127.0.0.1:1234"
              required
            />
          </label>

          <label>
            LM Studio Model ID
            <input
              type="text"
              value={form.lmStudioModel}
              onChange={(event) =>
                handleInput('lmStudioModel', event.target.value)
              }
              placeholder="qwen3"
              required
            />
          </label>

          <label>
            Preferred backend port
            <input
              type="number"
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

          <fieldset>
            <legend>LLM Provider</legend>
            <div className="settings-radios">
              <label>
                <input
                  type="radio"
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
              <label>
                <input
                  type="radio"
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
            <label>
              Google API Key
              <input
                type="password"
                value={form.googleApiKey}
                onChange={(event) =>
                  handleInput('googleApiKey', event.target.value)
                }
                placeholder="AIza..."
                required
              />
            </label>
          )}

          <div className="settings-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={isRestarting}>
              {isRestarting ? 'Applying…' : 'Save & Restart'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
