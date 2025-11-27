import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';
import { FolderOpen, MessageSquare } from 'lucide-react';
import FileExplorer from '../../explorer/FileExplorer/FileExplorer';
import PreviewPanel from '../../preview/PreviewPanel/PreviewPanel';
import ChatPanel from '../../chat/ChatPanel/ChatPanel';
import StatusBar from '../StatusBar/StatusBar';
import styles from './WorkspaceLayout.module.scss';

export default function WorkspaceLayout() {
  const [explorerExpanded, setExplorerExpanded] = useState(true);
  const [chatExpanded, setChatExpanded] = useState(true);

  const explorerPanelRef = useRef<ImperativePanelHandle>(null);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);

  const toggleExplorer = useCallback(() => {
    const panel = explorerPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  }, []);

  const toggleChat = useCallback(() => {
    const panel = chatPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
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
            className={`${styles.toggleButton} ${explorerExpanded ? styles.active : ''}`}
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
            className={`${styles.toggleButton} ${chatExpanded ? styles.active : ''}`}
            onClick={toggleChat}
            title="Toggle Chat (⌘I)"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>

      <div className={styles.workspace}>
        <PanelGroup direction="horizontal" autoSaveId="workspace-panels">
          <Panel
            ref={explorerPanelRef}
            defaultSize={20}
            minSize={15}
            maxSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => setExplorerExpanded(false)}
            onExpand={() => setExplorerExpanded(true)}
          >
            <FileExplorer />
          </Panel>
          <PanelResizeHandle className={styles.resizeHandle} />

          <Panel defaultSize={50} minSize={30}>
            <PreviewPanel />
          </Panel>

          <PanelResizeHandle className={styles.resizeHandle} />
          <Panel
            ref={chatPanelRef}
            defaultSize={30}
            minSize={20}
            maxSize={45}
            collapsible
            collapsedSize={0}
            onCollapse={() => setChatExpanded(false)}
            onExpand={() => setChatExpanded(true)}
          >
            <ChatPanel />
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar />
    </div>
  );
}
