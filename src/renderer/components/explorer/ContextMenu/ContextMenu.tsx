import { useEffect, useRef } from 'react';
import {
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  Scissors,
  Clipboard,
  FileText,
  FolderOpen,
} from 'lucide-react';
import styles from './ContextMenu.module.scss';

export interface ContextMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  dividerAfter?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  isDirectory: boolean;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onRevealInFinder: () => void;
  canPaste: boolean;
}

export default function ContextMenu({
  x,
  y,
  isDirectory,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopy,
  onCut,
  onPaste,
  onCopyPath,
  onCopyRelativePath,
  onRevealInFinder,
  canPaste,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  const actions: ContextMenuAction[] = [
    ...(isDirectory
      ? [
          {
            id: 'new-file',
            label: 'New File',
            icon: <FilePlus size={14} />,
            onClick: onNewFile,
          },
          {
            id: 'new-folder',
            label: 'New Folder',
            icon: <FolderPlus size={14} />,
            dividerAfter: true,
            onClick: onNewFolder,
          },
        ]
      : []),
    {
      id: 'cut',
      label: 'Cut',
      icon: <Scissors size={14} />,
      shortcut: '⌘X',
      onClick: onCut,
    },
    {
      id: 'copy',
      label: 'Copy',
      icon: <Copy size={14} />,
      shortcut: '⌘C',
      onClick: onCopy,
    },
    {
      id: 'paste',
      label: 'Paste',
      icon: <Clipboard size={14} />,
      shortcut: '⌘V',
      disabled: !canPaste,
      dividerAfter: true,
      onClick: onPaste,
    },
    {
      id: 'copy-path',
      label: 'Copy Path',
      icon: <FileText size={14} />,
      shortcut: '⌥⌘C',
      onClick: onCopyPath,
    },
    {
      id: 'copy-relative-path',
      label: 'Copy Relative Path',
      icon: <FileText size={14} />,
      shortcut: '⇧⌥⌘C',
      dividerAfter: true,
      onClick: onCopyRelativePath,
    },
    {
      id: 'rename',
      label: 'Rename',
      icon: <Pencil size={14} />,
      shortcut: 'F2',
      onClick: onRename,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 size={14} />,
      shortcut: '⌫',
      dividerAfter: true,
      onClick: onDelete,
    },
    {
      id: 'reveal',
      label: navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'Reveal in Finder' : 'Show in Explorer',
      icon: <FolderOpen size={14} />,
      onClick: onRevealInFinder,
    },
  ];

  return (
    <div ref={menuRef} className={styles.menu} style={{ left: x, top: y }}>
      {actions.map((action) => (
        <div key={action.id}>
          <button
            type="button"
            className={`${styles.menuItem} ${action.disabled ? styles.disabled : ''}`}
            onClick={() => {
              if (!action.disabled) {
                action.onClick();
                onClose();
              }
            }}
            disabled={action.disabled}
          >
            <span className={styles.icon}>{action.icon}</span>
            <span className={styles.label}>{action.label}</span>
            {action.shortcut && (
              <span className={styles.shortcut}>{action.shortcut}</span>
            )}
          </button>
          {action.dividerAfter && <div className={styles.divider} />}
        </div>
      ))}
    </div>
  );
}
