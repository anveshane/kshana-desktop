import type { MouseEvent } from 'react';
import { Download, FileText } from 'lucide-react';
import { artifactTypeLabel } from '../../artifactFormat';

interface Props {
  projectDir: string | null;
  outputPath: string | null;
}

export function FileCardBody({ projectDir, outputPath }: Props) {
  const label = artifactTypeLabel(outputPath);
  const name = outputPath?.split(/[\\/]/).pop() ?? 'artifact';
  const canDownload = Boolean(projectDir && outputPath);

  function handleDownload(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (!projectDir || !outputPath) return;
    void window.electron.project.saveMediaFile(`${projectDir}/${outputPath}`, outputPath);
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 14,
        textAlign: 'center',
      }}
    >
      <FileText size={24} strokeWidth={1.7} color="rgba(229, 225, 216, 0.65)" aria-hidden="true" />
      <div style={{ minWidth: 0, width: '100%' }}>
        <div style={{ fontSize: 11, color: '#e5e1d8', fontWeight: 650 }}>{label}</div>
        <div
          title={outputPath ?? undefined}
          style={{
            marginTop: 3,
            fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 9,
            lineHeight: 1.25,
            color: 'rgba(229, 225, 216, 0.42)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      </div>
      <button
        type="button"
        className="nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleDownload}
        disabled={!canDownload}
        title={canDownload ? `Download ${name}` : 'No file available'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 28,
          padding: '0 10px',
          borderRadius: 6,
          border: '1px solid rgba(var(--color-accent-primary-rgb), 0.38)',
          background: 'rgba(var(--color-accent-primary-rgb), 0.12)',
          color: '#e5e1d8',
          fontSize: 10,
          fontWeight: 650,
          cursor: canDownload ? 'pointer' : 'default',
          opacity: canDownload ? 1 : 0.45,
        }}
      >
        <Download size={13} strokeWidth={1.9} aria-hidden="true" />
        Download
      </button>
    </div>
  );
}

export default FileCardBody;
