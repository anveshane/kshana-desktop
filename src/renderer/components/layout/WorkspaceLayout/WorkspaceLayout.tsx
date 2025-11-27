import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import FileExplorer from '../../explorer/FileExplorer/FileExplorer';
import PreviewPanel from '../../preview/PreviewPanel/PreviewPanel';
import ChatPanel from '../../chat/ChatPanel/ChatPanel';
import StatusBar from '../StatusBar/StatusBar';
import styles from './WorkspaceLayout.module.scss';

export default function WorkspaceLayout() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Kshana Desktop</span>
      </div>

      <div className={styles.workspace}>
        <PanelGroup direction="horizontal" autoSaveId="workspace-panels">
          <Panel defaultSize={20} minSize={15} maxSize={35}>
            <FileExplorer />
          </Panel>

          <PanelResizeHandle className={styles.resizeHandle} />

          <Panel defaultSize={50} minSize={30}>
            <PreviewPanel />
          </Panel>

          <PanelResizeHandle className={styles.resizeHandle} />

          <Panel defaultSize={30} minSize={20} maxSize={45}>
            <ChatPanel />
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar />
    </div>
  );
}
