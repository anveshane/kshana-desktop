import type { FileNode } from '../../../../shared/fileSystemTypes';
import FileTreeNode from '../FileTreeNode/FileTreeNode';
import styles from './FileTree.module.scss';

interface FileTreeProps {
  root: FileNode;
}

export default function FileTree({ root }: FileTreeProps) {
  return (
    <div className={styles.container}>
      {root.children?.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
