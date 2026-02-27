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
  comfyuiUrl: 'http://localhost:8000',
  comfyuiTimeout: 1800,
};

export default function SettingsPanel({
  isOpen,
  settings,
  onClose,
  onSave,
  isRestarting,
  error,
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
          <label className={styles.label}>
            ComfyUI URL
            <input
              type="url"
              className={styles.input}
              value={form.comfyuiUrl}
              onChange={(event) =>
                handleInput('comfyuiUrl', event.target.value)
              }
              placeholder="http://localhost:8188"
              required
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
