import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, RefreshCw, Settings2, Sparkles } from 'lucide-react';
import styles from './ProjectSetupPanel.module.scss';

export interface SetupStyleOption {
  id: string;
  displayName: string;
  description?: string;
}

export interface SetupTemplateOption {
  id: string;
  displayName: string;
  description?: string;
  defaultStyle?: string;
  styles: SetupStyleOption[];
}

export interface SetupDurationOption {
  label: string;
  seconds: number;
}

export type SetupStep = 'template' | 'style' | 'duration';
export type SetupPanelMode = 'hidden' | 'banner' | 'wizard' | 'summary';

interface ProjectSetupPanelProps {
  mode: SetupPanelMode;
  step: SetupStep;
  templates: SetupTemplateOption[];
  durationPresets: Record<string, SetupDurationOption[]>;
  selectedTemplateId: string | null;
  selectedStyleId: string | null;
  selectedDuration: number | null;
  loading: boolean;
  configuring: boolean;
  error: string | null;
  onOpenWizard: () => void;
  onEditSetup: () => void;
  onSelectTemplate: (templateId: string) => void;
  onSelectStyle: (styleId: string) => void;
  onSelectDuration: (seconds: number) => void;
  onBack: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}

export default function ProjectSetupPanel({
  mode,
  step,
  templates,
  durationPresets,
  selectedTemplateId,
  selectedStyleId,
  selectedDuration,
  loading,
  configuring,
  error,
  onOpenWizard,
  onEditSetup,
  onSelectTemplate,
  onSelectStyle,
  onSelectDuration,
  onBack,
}: ProjectSetupPanelProps) {
  const [customDuration, setCustomDuration] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );

  const selectedStyle = useMemo(
    () =>
      selectedTemplate?.styles.find((style) => style.id === selectedStyleId) ??
      null,
    [selectedStyleId, selectedTemplate],
  );

  const selectedDurationLabel = useMemo(() => {
    if (!selectedTemplateId || !selectedDuration) return null;
    const preset = (durationPresets[selectedTemplateId] || []).find(
      (option) => option.seconds === selectedDuration,
    );
    return preset?.label || formatDuration(selectedDuration);
  }, [durationPresets, selectedDuration, selectedTemplateId]);

  const styleOptions = selectedTemplate?.styles || [];
  const durationOptions = selectedTemplateId
    ? durationPresets[selectedTemplateId] || []
    : [];

  useEffect(() => {
    if (mode !== 'wizard') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key < '1' || event.key > '9') return;

      const index = Number(event.key) - 1;
      if (step === 'template') {
        const target = templates[index];
        if (!target) return;
        event.preventDefault();
        onSelectTemplate(target.id);
        return;
      }

      if (step === 'style') {
        const target = styleOptions[index];
        if (!target) return;
        event.preventDefault();
        onSelectStyle(target.id);
        return;
      }

      const target = durationOptions[index];
      if (!target) return;
      event.preventDefault();
      onSelectDuration(target.seconds);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    durationOptions,
    mode,
    onSelectDuration,
    onSelectStyle,
    onSelectTemplate,
    step,
    styleOptions,
    templates,
  ]);

  const submitCustomDuration = () => {
    const seconds = Number.parseInt(customDuration, 10);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    onSelectDuration(seconds);
    setCustomDuration('');
  };

  if (mode === 'hidden') {
    return null;
  }

  if (mode === 'banner') {
    return (
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <Settings2 size={15} />
          <span>Configure Project Setup</span>
        </div>
        <button
          type="button"
          className={styles.bannerButton}
          onClick={onOpenWizard}
        >
          Start Setup
        </button>
      </div>
    );
  }

  if (mode === 'summary') {
    return (
      <div className={styles.summary}>
        <div className={styles.summaryHeader}>
          <div className={styles.summaryTitle}>
            <Sparkles size={14} />
            <span>Project Setup</span>
          </div>
          <button
            type="button"
            className={styles.summaryEdit}
            onClick={onEditSetup}
          >
            Edit
          </button>
        </div>
        <div className={styles.summaryTags}>
          <span className={styles.tag}>
            {selectedTemplate?.displayName || 'Narrative Story Video'}
          </span>
          <span className={styles.tag}>{selectedStyle?.displayName || 'Cinematic Realism'}</span>
          <span className={styles.tag}>{selectedDurationLabel || '2 minutes'}</span>
        </div>
        {(configuring || error) && (
          <div className={styles.summaryStatus}>
            {configuring ? (
              <>
                <RefreshCw size={13} className={styles.spin} />
                Configuring session...
              </>
            ) : (
              <span className={styles.errorText}>{error}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wizard}>
      <div className={styles.wizardHeader}>
        <div className={styles.wizardTitleRow}>
          {step !== 'template' && (
            <button
              type="button"
              className={styles.backButton}
              onClick={onBack}
              disabled={loading || configuring}
              aria-label="Back to previous setup step"
            >
              <ChevronLeft size={14} />
            </button>
          )}
          <span className={styles.wizardStep}>
            {step === 'template' && 'Step 1 of 3'}
            {step === 'style' && 'Step 2 of 3'}
            {step === 'duration' && 'Step 3 of 3'}
          </span>
        </div>
        <h3 className={styles.wizardTitle}>
          {step === 'template' && 'Choose a Template'}
          {step === 'style' && 'Choose a Style'}
          {step === 'duration' && 'Choose Duration'}
        </h3>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading options...</div>
      ) : (
        <>
          {step === 'template' && (
            <div className={styles.cardsGrid}>
              {templates.map((template, index) => (
                <button
                  type="button"
                  key={template.id}
                  className={`${styles.card} ${
                    selectedTemplateId === template.id ? styles.cardSelected : ''
                  }`}
                  onClick={() => onSelectTemplate(template.id)}
                  disabled={configuring}
                >
                  <span className={styles.cardIndex}>{index + 1}</span>
                  <span className={styles.cardName}>{template.displayName}</span>
                  <span className={styles.cardDescription}>
                    {template.description || 'No description'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'style' && (
            <div className={styles.cardsGrid}>
              {styleOptions.map((style, index) => (
                <button
                  type="button"
                  key={style.id}
                  className={`${styles.card} ${
                    selectedStyleId === style.id ? styles.cardSelected : ''
                  }`}
                  onClick={() => onSelectStyle(style.id)}
                  disabled={configuring}
                >
                  <span className={styles.cardIndex}>{index + 1}</span>
                  <span className={styles.cardName}>{style.displayName}</span>
                  <span className={styles.cardDescription}>
                    {style.description || 'No description'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'duration' && (
            <>
              <div className={styles.durationRow}>
                {durationOptions.map((duration, index) => (
                  <button
                    type="button"
                    key={`${duration.seconds}-${duration.label}`}
                    className={`${styles.durationButton} ${
                      selectedDuration === duration.seconds
                        ? styles.durationSelected
                        : ''
                    }`}
                    onClick={() => onSelectDuration(duration.seconds)}
                    disabled={configuring}
                  >
                    {index + 1}. {duration.label}
                  </button>
                ))}
              </div>
              <div className={styles.customDurationRow}>
                <input
                  type="number"
                  min={1}
                  className={styles.customInput}
                  placeholder="seconds"
                  value={customDuration}
                  onChange={(event) => setCustomDuration(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      submitCustomDuration();
                    }
                  }}
                  disabled={configuring}
                />
                <button
                  type="button"
                  className={styles.customSet}
                  onClick={submitCustomDuration}
                  disabled={configuring}
                >
                  Set
                </button>
              </div>
            </>
          )}
        </>
      )}

      {error && <div className={styles.errorText}>{error}</div>}
    </div>
  );
}
