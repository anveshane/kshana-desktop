import { useState, useEffect, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { FolderOpen, MessageSquare } from 'lucide-react';
import FileExplorer from '../../explorer/FileExplorer/FileExplorer';
import PreviewPanel from '../../preview/PreviewPanel/PreviewPanel';
import ChatPanel from '../../chat/ChatPanel/ChatPanel';
import StatusBar from '../StatusBar/StatusBar';
import styles from './WorkspaceLayout.module.scss';

export default function WorkspaceLayout() {
  const [showExplorer, setShowExplorer] = useState(true);
  const [showChat, setShowChat] = useState(true);

  const toggleExplorer = useCallback(() => {
    setShowExplorer((prev) => !prev);
  }, []);

  const toggleChat = useCallback(() => {
    setShowChat((prev) => !prev);
  }, []);

  // Keyboard shortcuts: Cmd+B for explorer, Cmd+I for chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleExplorer();
      }
      if (modifier && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleExplorer, toggleChat]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={`${styles.toggleButton} ${showExplorer ? styles.active : ''}`}
            onClick={toggleExplorer}
            title="Toggle Explorer (⌘B)"
          >
            <FolderOpen size={16} />
          </button>
        </div>
        <span className={styles.title}>Kshana Desktop</span>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.toggleButton} ${showChat ? styles.active : ''}`}
            onClick={toggleChat}
            title="Toggle Chat (⌘I)"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      <div className={styles.workspace}>
        <PanelGroup direction="horizontal" autoSaveId="workspace-panels">
          {showExplorer && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={35}>
                <FileExplorer />
              </Panel>
              <PanelResizeHandle className={styles.resizeHandle} />
            </>
          )}

          <Panel defaultSize={showExplorer && showChat ? 50 : 70} minSize={30}>
            <PreviewPanel />
          </Panel>

          {showChat && (
            <>
              <PanelResizeHandle className={styles.resizeHandle} />
              <Panel defaultSize={30} minSize={20} maxSize={45}>
                <ChatPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      <StatusBar />
    </div>
  );
}
