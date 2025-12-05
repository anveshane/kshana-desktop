import { useEffect, useCallback } from 'react';

type ShortcutHandler = () => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: ShortcutHandler;
}

const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const modifierKey = isMac ? event.metaKey : event.ctrlKey;
        const needsModifier = shortcut.meta || shortcut.ctrl;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (needsModifier ? modifierKey : true) &&
          (shortcut.shift ? event.shiftKey : !event.shiftKey)
        ) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export { isMac };
