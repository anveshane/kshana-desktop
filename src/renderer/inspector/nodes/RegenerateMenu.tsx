/**
 * Right-click context menu for canvas cards + rail tiles.
 *
 * Items:
 *   - Regenerate        — fire-and-forget redoNode IPC
 *   - Open in Finder    — reveal the artifact in the OS file viewer
 *                         (only when outputPath is known)
 *   - Copy path         — copy the absolute artifact path to clipboard
 *                         (only when outputPath is known)
 *   - Invalidate        — mark this node pending (without running)
 *
 * Per the binary-workspace UX-8 task: discoverability + power-user
 * affordances. Keeps the menu compact (4 items max) — destructive
 * "delete file" intentionally NOT here.
 */
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { RunnerCatalogEntry } from '../../../shared/dheeIpc';
import { useDheeSession } from '../../hooks/useDheeSession';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import styles from './RegenerateMenu.module.scss';

export interface RegenerateMenuProps {
  /** The node id to pass to redoNode / invalidateNodes. Omit for pending instances. */
  nodeId?: string;
  /** Relative artifact path (walkState outputPath). Powers Open in Finder + Copy path. */
  outputPath?: string;
  children: ReactNode;
}

interface MenuState {
  open: boolean;
  x: number;
  y: number;
}

interface NodeRef {
  nodeId: string;
  itemId?: string;
}

function splitNodeRef(value: string): NodeRef {
  const [bare, ...rest] = value.split(':');
  return rest.length > 0
    ? { nodeId: bare || value, itemId: rest.join(':') }
    : { nodeId: bare || value };
}

export function RegenerateMenu({ nodeId, outputPath, children }: RegenerateMenuProps) {
  const { sessionId, redoNode } = useDheeSession();
  const { projectDirectory } = useWorkspace();
  const [menu, setMenu] = useState<MenuState>({ open: false, x: 0, y: 0 });
  const [switchPanel, setSwitchPanel] = useState<MenuState>({ open: false, x: 0, y: 0 });
  const [runnerCatalog, setRunnerCatalog] = useState<RunnerCatalogEntry[]>([]);
  const [selectedRunner, setSelectedRunner] = useState('');
  const [forceSwitch, setForceSwitch] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const onContextMenu = useCallback(
    (event: MouseEvent) => {
      if (!nodeId) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ open: true, x: event.clientX, y: event.clientY });
    },
    [nodeId],
  );

  const dismiss = useCallback(() => setMenu((m) => ({ ...m, open: false })), []);
  const dismissSwitchPanel = useCallback(() => {
    setSwitchPanel((m) => ({ ...m, open: false }));
    setSwitchError(null);
    setForceSwitch(false);
  }, []);

  const onRegenerate = useCallback(() => {
    if (!nodeId) return;
    void redoNode(nodeId);
    dismiss();
  }, [nodeId, redoNode, dismiss]);

  const onRevealInFinder = useCallback(() => {
    if (!outputPath || !projectDirectory) return;
    const absPath = `${projectDirectory}/${outputPath}`;
    void window.electron?.project?.revealInFinder?.(absPath);
    dismiss();
  }, [outputPath, projectDirectory, dismiss]);

  const onCopyPath = useCallback(() => {
    if (!outputPath || !projectDirectory) return;
    const absPath = `${projectDirectory}/${outputPath}`;
    void navigator.clipboard?.writeText(absPath);
    dismiss();
  }, [outputPath, projectDirectory, dismiss]);

  const onInvalidate = useCallback(() => {
    if (!nodeId || !sessionId) return;
    void window.dhee?.invalidateNodes?.({
      sessionId,
      nodeIds: [nodeId],
      source: 'inspector_context_menu',
    });
    dismiss();
  }, [nodeId, sessionId, dismiss]);

  const onOpenSwitchRunner = useCallback(() => {
    if (!nodeId) return;
    const { x, y } = menu;
    setMenu((m) => ({ ...m, open: false }));
    setSwitchPanel({ open: true, x, y });
    setSwitchError(null);
    if (runnerCatalog.length === 0) {
      void window.dhee
        ?.listRunners?.()
        .then((result) => {
          if (!result.ok) {
            setSwitchError(result.error ?? 'Runner catalog is unavailable.');
            return;
          }
          const runners = (result.runners ?? []).filter((runner) => runner.registered);
          setRunnerCatalog(runners);
          setSelectedRunner((current) => current || runners[0]?.tool || '');
        })
        .catch((err) => {
          setSwitchError(err instanceof Error ? err.message : String(err));
        });
    } else {
      setSelectedRunner((current) => current || runnerCatalog[0]?.tool || '');
    }
  }, [nodeId, menu, runnerCatalog]);

  const applyRunnerSwitch = useCallback(
    async (regenerate: boolean) => {
      if (!nodeId || !projectDirectory || !selectedRunner) return;
      const ref = splitNodeRef(nodeId);
      setSwitchBusy(true);
      setSwitchError(null);
      try {
        const result = await window.dhee.switchRunner({
          projectDir: projectDirectory,
          nodeId: ref.nodeId,
          ...(ref.itemId ? { itemId: ref.itemId, scope: 'instance' as const } : { scope: 'node' as const }),
          toTool: selectedRunner,
          force: forceSwitch,
          regenerate,
        });
        if (!result.ok) {
          setSwitchError(result.error ?? result.reason ?? 'Runner switch failed.');
          return;
        }
        dismissSwitchPanel();
      } catch (err) {
        setSwitchError(err instanceof Error ? err.message : String(err));
      } finally {
        setSwitchBusy(false);
      }
    },
    [nodeId, projectDirectory, selectedRunner, forceSwitch, dismissSwitchPanel],
  );

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu.open, dismiss]);

  useEffect(() => {
    if (!switchPanel.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissSwitchPanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [switchPanel.open, dismissSwitchPanel]);

  const canRevealOrCopy = !!outputPath && !!projectDirectory;

  return (
    <div onContextMenu={onContextMenu} className={styles.target}>
      {children}
      {menu.open
        ? createPortal(
          <>
            <div
              className={styles.backdrop}
              data-testid="regenerate-backdrop"
              onClick={dismiss}
            />
            <div
              className={styles.menu}
              style={{ left: menu.x, top: menu.y }}
              role="menu"
            >
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={onRegenerate}
              >
                Regenerate
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={onOpenSwitchRunner}
              >
                Switch runner…
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={onRevealInFinder}
                disabled={!canRevealOrCopy}
                title={canRevealOrCopy ? 'Reveal in Finder' : 'No artifact yet'}
              >
                Open in Finder
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={onCopyPath}
                disabled={!canRevealOrCopy}
                title={canRevealOrCopy ? 'Copy file path' : 'No artifact yet'}
              >
                Copy path
              </button>
              <div className={styles.divider} role="separator" />
              <button
                type="button"
                role="menuitem"
                className={`${styles.item} ${styles.itemDestructive}`}
                onClick={onInvalidate}
              >
                Invalidate (mark pending)
              </button>
            </div>
          </>,
          document.body,
        )
        : null}
      {switchPanel.open
        ? createPortal(
          <>
            <div
              className={styles.backdrop}
              data-testid="runner-switch-backdrop"
              onClick={dismissSwitchPanel}
            />
            <div
              className={styles.switchPanel}
              style={{ left: switchPanel.x, top: switchPanel.y }}
              role="dialog"
              aria-label="Switch runner"
            >
              <div className={styles.switchTitle}>Switch runner</div>
              <select
                className={styles.switchSelect}
                value={selectedRunner}
                onChange={(event) => setSelectedRunner(event.target.value)}
                disabled={switchBusy}
              >
                {runnerCatalog.map((runner) => (
                  <option key={runner.tool} value={runner.tool}>
                    {runner.displayName} · {runner.tool}
                  </option>
                ))}
              </select>
              <label className={styles.switchForce}>
                <input
                  type="checkbox"
                  checked={forceSwitch}
                  onChange={(event) => setForceSwitch(event.target.checked)}
                  disabled={switchBusy}
                />
                Force unverified switch
              </label>
              {switchError ? (
                <div className={styles.switchError}>{switchError}</div>
              ) : null}
              <div className={styles.switchActions}>
                <button
                  type="button"
                  className={styles.switchButton}
                  onClick={() => void applyRunnerSwitch(false)}
                  disabled={switchBusy || !selectedRunner || !projectDirectory}
                >
                  Future runs only
                </button>
                <button
                  type="button"
                  className={styles.switchButtonPrimary}
                  onClick={() => void applyRunnerSwitch(true)}
                  disabled={switchBusy || !selectedRunner || !projectDirectory}
                >
                  Switch + regenerate
                </button>
              </div>
            </div>
          </>,
          document.body,
        )
        : null}
    </div>
  );
}
