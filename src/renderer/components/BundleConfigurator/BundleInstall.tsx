/**
 * BundleInstall — import a community bundle from npm, a local folder, or git.
 * npm uses installBundlePackage; folder/git use dhee-core installBundle.
 */
import { useState } from 'react';
import type { BundleInstallSource } from '../../../shared/bundleConfigTypes';
import { looksLikeNpmPackageSpec } from '../../utils/npmPackageSpec';
import { Button, Input, SegmentedControl, Card } from '../ui';
import styles from './BundleInstall.module.scss';

export type BundleInstallMeta = { packageName?: string };

export default function BundleInstall({
  onInstalled,
}: {
  onInstalled: (bundleId: string, meta?: BundleInstallMeta) => void;
}) {
  const [kind, setKind] = useState<'npm' | 'folder' | 'git'>('npm');
  const [npmSpec, setNpmSpec] = useState('');
  const [folder, setFolder] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFolder = async () => {
    try {
      const dir = await window.electron.project.selectDirectory();
      if (dir) setFolder(dir);
    } catch {
      /* cancelled */
    }
  };

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'npm') {
        const packageSpec = npmSpec.trim();
        if (!packageSpec) return;
        const res = await window.electron.project.installBundlePackage({ packageSpec });
        if (res.ok) {
          onInstalled(res.bundleId, { packageName: res.packageName });
        } else {
          setError(res.error);
        }
        return;
      }

      const source: BundleInstallSource =
        kind === 'folder'
          ? { kind: 'folder', path: folder.trim() }
          : { kind: 'git', url: gitUrl.trim() };
      if ((kind === 'folder' && !folder.trim()) || (kind === 'git' && !gitUrl.trim())) {
        return;
      }
      if (kind === 'folder' && looksLikeNpmPackageSpec(folder)) {
        setError(
          'That looks like an npm package name. Switch to the npm tab, or paste a folder path (e.g. …/bundles/cartoon_explainer).',
        );
        return;
      }
      const res = await window.electron.bundleConfig.install(source);
      if (res.ok) {
        onInstalled(res.bundleId);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={styles.wrap}>
      <SegmentedControl
        aria-label="Bundle source"
        value={kind}
        onChange={(v) => setKind(v as 'npm' | 'folder' | 'git')}
        options={[
          { value: 'npm', label: '📦 npm' },
          { value: 'folder', label: '📁 Folder' },
          { value: 'git', label: '🌐 Git URL' },
        ]}
      />
      {kind === 'npm' ? (
        <Input
          mono
          value={npmSpec}
          placeholder="@dhee_ai/bundle-cartoon-explainer"
          onChange={(e) => setNpmSpec(e.target.value)}
        />
      ) : kind === 'folder' ? (
        <div className={styles.row}>
          <Input
            mono
            style={{ flex: 1 }}
            value={folder}
            placeholder="/path/to/bundle or …/bundles/cartoon_explainer"
            onChange={(e) => setFolder(e.target.value)}
          />
          <Button variant="secondary" size="sm" onClick={() => void pickFolder()}>
            Browse…
          </Button>
        </div>
      ) : (
        <Input
          mono
          value={gitUrl}
          placeholder="https://github.com/author/bundle"
          onChange={(e) => setGitUrl(e.target.value)}
        />
      )}
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void install()} disabled={busy}>
          {busy ? 'Installing…' : 'Install bundle'}
        </Button>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    </Card>
  );
}
