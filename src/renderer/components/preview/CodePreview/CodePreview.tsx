import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CodePreview.module.scss';

// Import CodeMirror modules - use standard imports
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

// Check if CodeMirror is available - handle case where imports might fail
let codemirrorAvailable = false;
try {
  // Safely check if EditorView exists and has the required properties
  // Use optional chaining to avoid errors if EditorView is undefined
  if (typeof EditorView !== 'undefined' && 
      EditorView !== null && 
      typeof EditorState !== 'undefined' && 
      EditorState !== null &&
      EditorView?.updateListener !== undefined) {
    codemirrorAvailable = true;
  }
} catch (err) {
  console.warn('CodeMirror not available, will use fallback:', err);
  codemirrorAvailable = false;
}

interface CodePreviewProps {
  content: string;
  extension?: string;
  fileName?: string;
  filePath?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

const getLanguageExtension = (ext?: string) => {
  if (!codemirrorAvailable || !ext) return [];
  const normalized = ext.toLowerCase().replace('.', '');
  switch (normalized) {
    case 'json':
      try {
        return json ? [json()] : [];
      } catch {
        return [];
      }
    case 'md':
    case 'markdown':
      try {
        return markdown ? [markdown()] : [];
      } catch (err) {
        console.error('Failed to load markdown extension:', err);
        return [];
      }
    case 'yaml':
    case 'yml':
      try {
        return yaml ? [yaml()] : [];
      } catch {
        return [];
      }
    default:
      return [];
  }
};

// Fallback plain text editor component
function PlainTextEditor({
  content,
  fileName,
  filePath,
  onDirtyChange,
}: CodePreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const originalContentRef = useRef<string>(content);
  const [currentContent, setCurrentContent] = useState<string>(content);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    originalContentRef.current = content;
    setCurrentContent(content);
    setIsDirty(false);
  }, [content]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setCurrentContent(newContent);
    const dirty = newContent !== originalContentRef.current;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  }, [onDirtyChange]);

  const saveFile = useCallback(async () => {
    if (!filePath) return;
    try {
      await window.electron.project.writeFile(filePath, currentContent);
      originalContentRef.current = currentContent;
      setIsDirty(false);
      onDirtyChange?.(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [filePath, currentContent, onDirtyChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveFile();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);

  return (
    <div className={styles.container}>
      {fileName && (
        <div className={styles.fileName}>
          {fileName}
          {isDirty && <span className={styles.dirtyIndicator}>●</span>}
        </div>
      )}
      <textarea
        ref={textareaRef}
        className={styles.plainTextEditor}
        value={currentContent}
        onChange={handleChange}
        spellCheck={false}
      />
    </div>
  );
}

export default function CodePreview({
  content,
  extension,
  fileName,
  filePath,
  onDirtyChange,
}: CodePreviewProps) {
  // Use plain text fallback if CodeMirror is not available
  if (!codemirrorAvailable) {
    return (
      <PlainTextEditor
        content={content}
        fileName={fileName}
        filePath={filePath}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<any>(null);
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
    if (viewRef.current && openSearchPanel) {
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

    // Check if CodeMirror is actually available before trying to use it
    // Specifically check for EditorView.updateListener which is needed
    if (!codemirrorAvailable || !EditorView || !EditorState || 
        typeof EditorView.updateListener === 'undefined') {
      setError('FALLBACK_TO_PLAINTEXT');
      return;
    }

    // Ensure content is a string (handle null/undefined)
    const safeContent = typeof content === 'string' ? content : '';

    try {
      // Clean up existing editor instance
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }

      originalContentRef.current = safeContent;
      const languageExtensions = getLanguageExtension(extension);

      // Double-check that EditorView is available
      if (!EditorView || typeof EditorView.updateListener === 'undefined') {
        throw new Error('CodeMirror EditorView not properly loaded');
      }

      const updateListener = EditorView.updateListener.of((update: any) => {
        if (update.docChanged) {
          const currentContent = update.state.doc.toString();
          const dirty = currentContent !== originalContentRef.current;
          setIsDirty(dirty);
          onDirtyChange?.(dirty);
        }
      });

      const state = EditorState.create({
        doc: safeContent,
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

      if (!editorRef.current) {
        throw new Error('Editor ref is not available');
      }

      viewRef.current = new EditorView({
        state,
        parent: editorRef.current,
      });

      setError(null);
      setIsDirty(false);
    } catch (err) {
      console.error('Failed to initialize CodeMirror editor:', err);
      // Fall back to plain text editor
      setError('FALLBACK_TO_PLAINTEXT');
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [content, extension, onDirtyChange]);

  // If CodeMirror fails to initialize, fall back to plain text editor
  if (error === 'FALLBACK_TO_PLAINTEXT') {
    return (
      <PlainTextEditor
        content={content}
        fileName={fileName}
        filePath={filePath}
        onDirtyChange={onDirtyChange}
      />
    );
  }

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
