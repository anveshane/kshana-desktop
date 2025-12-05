import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from 'react-resizable-panels';
import { MessageSquare } from 'lucide-react';
import PreviewPanel from '../../preview/PreviewPanel/PreviewPanel';
import ChatPanel from '../../chat/ChatPanel/ChatPanel';
import StatusBar from '../StatusBar/StatusBar';
import RecentProjectsDropdown from '../RecentProjectsDropdown/RecentProjectsDropdown';
import styles from './WorkspaceLayout.module.scss';

export default function WorkspaceLayout() {
  const [chatExpanded, setChatExpanded] = useState(true);

  const chatPanelRef = useRef<ImperativePanelHandle>(null);

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

  // Keyboard shortcut: Cmd+I for chat
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        toggleChat();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleChat]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <RecentProjectsDropdown />
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
          <Panel defaultSize={70} minSize={50}>
            <PreviewPanel />
          </Panel>

          <PanelResizeHandle className={styles.resizeHandle} />
          <Panel
            ref={chatPanelRef}
            defaultSize={30}
            minSize={20}
            maxSize={50}
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
