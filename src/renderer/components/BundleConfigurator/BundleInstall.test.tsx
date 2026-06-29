import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BundleInstall from './BundleInstall';

function installElectron(opts: {
  folderResult?: { ok: true; bundleId: string; dir: string } | { ok: false; error: string };
  npmResult?: {
    ok: true;
    packageName: string;
    version: string;
    bundleId: string;
    bundleDir: string;
  } | { ok: false; error: string };
}) {
  const install = jest.fn(async () =>
    opts.folderResult ?? { ok: true, bundleId: 'cyberpunk_anime_pack', dir: '/u/cyberpunk_anime_pack' },
  );
  const installBundlePackage = jest.fn(async () =>
    opts.npmResult ?? {
      ok: true,
      packageName: '@dhee_ai/bundle-cartoon-explainer',
      version: '0.1.1',
      bundleId: 'cartoon_explainer',
      bundleDir: '/u/cartoon_explainer',
    },
  );
  (window as unknown as { electron: unknown }).electron = {
    bundleConfig: { install },
    project: {
      selectDirectory: jest.fn(async () => '/picked/bundle'),
      installBundlePackage,
    },
  };
  return { install, installBundlePackage };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BundleInstall', () => {
  it('installs an npm package spec and hands the bundle id back', async () => {
    const { installBundlePackage } = installElectron({});
    const onInstalled = jest.fn();
    render(<BundleInstall onInstalled={onInstalled} />);

    fireEvent.change(screen.getByPlaceholderText('@dhee_ai/bundle-cartoon-explainer'), {
      target: { value: '@dhee_ai/bundle-cartoon-explainer' },
    });
    fireEvent.click(screen.getByText('Install bundle'));

    await waitFor(() =>
      expect(installBundlePackage).toHaveBeenCalledWith({
        packageSpec: '@dhee_ai/bundle-cartoon-explainer',
      }),
    );
    await waitFor(() =>
      expect(onInstalled).toHaveBeenCalledWith('cartoon_explainer', {
        packageName: '@dhee_ai/bundle-cartoon-explainer',
      }),
    );
  });

  it('installs a folder source and hands the new bundle id back', async () => {
    const { install } = installElectron({});
    const onInstalled = jest.fn();
    render(<BundleInstall onInstalled={onInstalled} />);

    fireEvent.click(screen.getByText('📁 Folder'));
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/bundle/), {
      target: { value: '/dl/pack' },
    });
    fireEvent.click(screen.getByText('Install bundle'));

    await waitFor(() => expect(install).toHaveBeenCalledWith({ kind: 'folder', path: '/dl/pack' }));
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith('cyberpunk_anime_pack'));
  });

  it('rejects npm-looking strings on the folder tab', async () => {
    const { install } = installElectron({});
    render(<BundleInstall onInstalled={jest.fn()} />);

    fireEvent.click(screen.getByText('📁 Folder'));
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/bundle/), {
      target: { value: '@dhee_ai/bundle-cartoon-explainer' },
    });
    fireEvent.click(screen.getByText('Install bundle'));

    expect(await screen.findByText(/Switch to the npm tab/)).toBeTruthy();
    expect(install).not.toHaveBeenCalled();
  });

  it('switches to git and installs from a URL', async () => {
    const { install } = installElectron({});
    render(<BundleInstall onInstalled={jest.fn()} />);

    fireEvent.click(screen.getByText('🌐 Git URL'));
    fireEvent.change(screen.getByPlaceholderText('https://github.com/author/bundle'), {
      target: { value: 'https://github.com/x/y' },
    });
    fireEvent.click(screen.getByText('Install bundle'));

    await waitFor(() => expect(install).toHaveBeenCalledWith({ kind: 'git', url: 'https://github.com/x/y' }));
  });

  it('surfaces an install error and does not call onInstalled', async () => {
    installElectron({ folderResult: { ok: false, error: 'invalid bundle: missing nodes' } });
    const onInstalled = jest.fn();
    render(<BundleInstall onInstalled={onInstalled} />);

    fireEvent.click(screen.getByText('📁 Folder'));
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/bundle/), { target: { value: '/bad' } });
    fireEvent.click(screen.getByText('Install bundle'));

    expect(await screen.findByText(/invalid bundle: missing nodes/)).toBeTruthy();
    expect(onInstalled).not.toHaveBeenCalled();
  });
});
