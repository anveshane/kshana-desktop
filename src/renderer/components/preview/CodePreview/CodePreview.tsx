import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';
import styles from './CodePreview.module.scss';

interface CodePreviewProps {
  content: string;
  extension?: string;
  fileName?: string;
  filePath?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

const getLanguageExtension = (ext?: string) => {
  if (!ext) return [];
  const normalized = ext.toLowerCase().replace('.', '');
  switch (normalized) {
    case 'json':
      return [json()];
    case 'md':
    case 'markdown':
      return [markdown()];
    case 'yaml':
    case 'yml':
      return [yaml()];
    default:
      return [];
  }
};

export default function CodePreview({
  content,
  extension,
  fileName,
  filePath,
  onDirtyChange,
}: CodePreviewProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const originalContentRef = useRef<string>(content);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const saveFile = useCallback(async () => {
    if (!filePath || !viewRef.current) return;
    const currentContent = viewRef.current.state.doc.toString();
    try {
      await window.electron.project.writeFile(filePath, currentContent);
      originalContentRef.current = currentContent;
      setIsDirty(false);
      onDirtyChange?.(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [filePath, onDirtyChange]);

  const openFind = useCallback(() => {
    if (viewRef.current) {
      openSearchPanel(viewRef.current);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
      }
      if (modifier && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openFind();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile, openFind]);

  useEffect(() => {
    if (!editorRef.current) return;

    try {
      if (viewRef.current) {
        viewRef.current.destroy();
      }

      originalContentRef.current = content;
      const languageExtensions = getLanguageExtension(extension);

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const currentContent = update.state.doc.toString();
          const dirty = currentContent !== originalContentRef.current;
          setIsDirty(dirty);
          onDirtyChange?.(dirty);
        }
      });

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          keymap.of(searchKeymap),
          oneDark,
          EditorView.editable.of(true),
          EditorView.lineWrapping,
          updateListener,
          ...languageExtensions,
        ],
      });

      viewRef.current = new EditorView({
        state,
        parent: editorRef.current,
      });

      setError(null);
      setIsDirty(false);
    } catch (err) {
      setError('Failed to initialize editor');
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [content, extension, onDirtyChange]);

  if (error) {
    return (
      <div className={styles.error}>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {fileName && (
        <div className={styles.fileName}>
          {fileName}
          {isDirty && <span className={styles.dirtyIndicator}>●</span>}
        </div>
      )}
      <div ref={editorRef} className={styles.editor} />
    </div>
  );
}
