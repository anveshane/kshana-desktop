import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { DESKTOP_THEMES } from '../../themes';
import styles from './ThemeQuickMenu.module.scss';

type Props = {
  trigger: ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
};

export default function ThemeQuickMenu({
  trigger,
  buttonClassName,
  menuClassName,
  align = 'left',
}: Props) {
  const {
    themeId,
    updateTheme,
    openSettings,
  } = useAppSettings();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        type="button"
        className={`${styles.trigger} ${buttonClassName ?? ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          className={`${styles.menu} ${align === 'right' ? styles.alignRight : ''} ${menuClassName ?? ''}`}
        >
          <div className={styles.sectionLabel}>Themes</div>
          {DESKTOP_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={styles.menuItem}
              onClick={async () => {
                await updateTheme(theme.id);
                setIsOpen(false);
              }}
            >
              <span className={styles.menuThemeMeta}>
                <span className={styles.menuThemeName}>{theme.name}</span>
                <span className={styles.menuThemeDescription}>
                  {theme.description}
                </span>
              </span>
              {themeId === theme.id && <Check size={14} className={styles.checkIcon} />}
            </button>
          ))}
          <div className={styles.divider} />
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              openSettings();
              setIsOpen(false);
            }}
          >
            Open Settings
          </button>
        </div>
      )}
    </div>
  );
}
