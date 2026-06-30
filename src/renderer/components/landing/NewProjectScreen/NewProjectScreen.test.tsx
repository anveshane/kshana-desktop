import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewProjectScreen from './NewProjectScreen';
import { consumeProjectAutoStart } from '../../../utils/projectAutoStart';

const mockOpenProject = jest.fn<(path: string) => Promise<void>>();

jest.mock('../../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    openProject: mockOpenProject,
  }),
}));

const youtubeBundle = {
  id: 'youtube_short_text_video',
  version: '0.1.0',
  bundleSource: 'user:youtube_short_text_video',
  sourceScheme: 'user',
  displayName: 'YouTube Short',
  summary: 'Short-form vertical video.',
  pickerEligible: true,
  runtimeSupport: {
    modes: ['local', 'dhee_cloud'],
    providers: ['llm', 'ffmpeg'],
  },
  inputs: [
    {
      id: 'story_input',
      kind: 'file',
      path: 'inputs/story.md',
      required: true,
      placeholder: 'Short idea...',
    },
    {
      id: 'targetDuration',
      kind: 'project',
      field: 'targetDuration',
      default: 30,
      label: 'Duration',
      control: 'pills',
      options: [{ value: 30, label: '30s' }],
    },
  ],
};

const localOnlyBundle = {
  ...youtubeBundle,
  id: 'local_only_video',
  bundleSource: 'user:local_only_video',
  displayName: 'Local Only Video',
  runtimeSupport: {
    modes: ['local'],
    providers: ['comfy', 'llm', 'ffmpeg'],
  },
};

const ugcProductBundle = {
  id: 'ugc_ad_product_v2',
  version: '0.1.0',
  bundleSource: 'user:ugc_ad_product_v2',
  sourceScheme: 'user',
  displayName: 'UGC Product Ad',
  summary: 'Product ad with pack shot.',
  pickerEligible: true,
  runtimeSupport: {
    modes: ['local', 'dhee_cloud'],
    providers: ['comfy', 'llm', 'ffmpeg'],
  },
  inputs: [
    {
      id: 'product_description',
      kind: 'file',
      path: 'inputs/product.md',
      label: 'Product description',
      multiline: true,
    },
    {
      id: 'product_image',
      kind: 'file',
      path: 'inputs/product.png',
      label: 'Product photo',
    },
  ],
};

describe('NewProjectScreen bundle packages', () => {
  const listBundles = jest.fn<() => Promise<unknown[]>>();
  const installBundlePackage =
    jest.fn<(payload: unknown) => Promise<unknown>>();
  const searchNpmBundles =
    jest.fn<(payload?: unknown) => Promise<unknown>>();
  const checkBundleFit =
    jest.fn<(bundleId?: unknown, endpoint?: unknown) => Promise<unknown>>();
  const readBundleResolution =
    jest.fn<(bundleId?: unknown, endpoint?: unknown) => Promise<unknown>>();
  const initialize =
    jest.fn<(payload: unknown) => Promise<{ ok: true; projectDir: string }>>();
  const createFolder = jest.fn<() => Promise<string | null>>();
  const selectAttachment = jest.fn<(payload: unknown) => Promise<unknown>>();
  const importReferenceImages =
    jest.fn<(payload: unknown) => Promise<unknown>>();

  beforeEach(() => {
    mockOpenProject.mockReset();
    listBundles.mockReset();
    installBundlePackage.mockReset();
    searchNpmBundles.mockReset();
    checkBundleFit.mockReset();
    readBundleResolution.mockReset();
    initialize.mockReset();
    createFolder.mockReset();
    selectAttachment.mockReset();
    importReferenceImages.mockReset();
    window.sessionStorage.clear();

    mockOpenProject.mockResolvedValue(undefined);
    createFolder.mockResolvedValue('/projects/my-short');
    initialize.mockResolvedValue({
      ok: true,
      projectDir: '/projects/my-short',
    });
    selectAttachment.mockResolvedValue({ ok: false });
    importReferenceImages.mockResolvedValue({ ok: true, attachments: [] });
    // The picker auto-searches npm on open — default to no published hits.
    searchNpmBundles.mockResolvedValue({ ok: true, hits: [] });
    checkBundleFit.mockResolvedValue({ error: 'ComfyUI not connected in test' });
    readBundleResolution.mockResolvedValue(null);

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        settings: {
          get: async () => ({ comfyuiMode: 'local', comfyuiUrl: '' }),
        },
        bundleConfig: {
          check: checkBundleFit,
          resolution: readBundleResolution,
        },
        project: {
          listBundles,
          installBundlePackage,
          searchNpmBundles,
          getDefaultWorkspacePath: async () => '/projects',
          getRecent: async () => [],
          selectDirectory: async () => '/projects',
          createFolder,
          initialize,
          selectAttachment,
          importReferenceImages,
        },
      },
    });
  });

  it('installs a published npm bundle from a search result and refreshes the picker', async () => {
    listBundles.mockResolvedValueOnce([]);
    listBundles.mockResolvedValueOnce([youtubeBundle]);
    // A published, not-yet-installed bundle surfaces as an "Available · npm" card.
    searchNpmBundles.mockResolvedValue({
      ok: true,
      hits: [
        {
          name: '@dhee_ai/youtube-short-bundle',
          displayName: 'Youtube Short Bundle',
          version: '0.1.0',
          description: 'Short-form vertical video.',
          spec: '@dhee_ai/youtube-short-bundle',
        },
      ],
    });
    installBundlePackage.mockResolvedValue({
      ok: true,
      packageName: '@dhee_ai/youtube-short-bundle',
      version: '0.1.0',
      bundleId: 'youtube_short_text_video',
      bundleDir: '/projects/bundles/youtube_short_text_video',
      installedRunners: [],
      runnerErrors: [],
    });

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    // The available card (derived display name) renders from the auto-search.
    await waitFor(() =>
      expect(screen.getByText('Youtube Short Bundle')).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole('button', { name: /install \+ runners/i }));

    await waitFor(() =>
      expect(screen.getByText('YouTube Short')).not.toBeNull(),
    );
    expect(installBundlePackage).toHaveBeenCalledWith({
      packageSpec: '@dhee_ai/youtube-short-bundle',
    });
  });

  it('passes user bundleSource into project initialization', async () => {
    listBundles.mockResolvedValue([youtubeBundle]);

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('YouTube Short'));
    fireEvent.click(screen.getByText('YouTube Short'));
    fireEvent.change(screen.getByPlaceholderText('Short idea...'), {
      target: { value: 'A creator learns why the first three seconds matter.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^roll/i }));

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'youtube_short_text_video',
          bundleSource: 'user:youtube_short_text_video',
          inputs: expect.objectContaining({
            story_input: 'A creator learns why the first three seconds matter.',
          }),
        }),
      );
    });
    expect(consumeProjectAutoStart('/projects/my-short')).toBe(true);
  });

  it('shows Dhee Cloud support labels on bundle cards', async () => {
    listBundles.mockResolvedValue([youtubeBundle]);

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('YouTube Short'));
    expect(screen.getByText('Supported by Dhee Cloud')).not.toBeNull();
    expect(screen.getByText('Local')).not.toBeNull();
    expect(screen.getByText('LLM')).not.toBeNull();
  });

  it('uses Dhee Cloud compatibility instead of probing local ComfyUI in cloud mode', async () => {
    listBundles.mockResolvedValue([youtubeBundle]);

    render(
      <NewProjectScreen
        isOpen
        onClose={jest.fn()}
        backendReady
        comfyBackend="cloud"
      />,
    );

    await waitFor(() => screen.getByText('YouTube Short'));
    fireEvent.click(screen.getByText('YouTube Short'));

    expect(screen.queryByText('ComfyUI endpoint')).toBeNull();
    expect(screen.queryByText('Check fit')).toBeNull();
    expect(screen.queryByText(/Endpoint unreachable/i)).toBeNull();
    expect(screen.getAllByText(/Ready on Dhee Cloud/i).length).toBeGreaterThan(0);
    expect(checkBundleFit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Short idea...'), {
      target: { value: 'A creator turns a lesson into a complete short.' },
    });

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^roll/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
  });

  it('blocks Roll for bundles that do not support Dhee Cloud Comfy', async () => {
    listBundles.mockResolvedValue([localOnlyBundle]);

    render(
      <NewProjectScreen
        isOpen
        onClose={jest.fn()}
        backendReady
        comfyBackend="cloud"
      />,
    );

    await waitFor(() => screen.getByText('Local Only Video'));
    fireEvent.click(screen.getByText('Local Only Video'));
    fireEvent.change(screen.getByPlaceholderText('Short idea...'), {
      target: { value: 'A local workflow needs a local Comfy renderer.' },
    });

    expect(screen.getByText(/Not available on Dhee Cloud/i)).not.toBeNull();
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: /^roll/i }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    );
    expect(checkBundleFit).not.toHaveBeenCalled();
  });

  it('imports setup character references and passes them into project initialization', async () => {
    listBundles.mockResolvedValue([youtubeBundle]);
    selectAttachment.mockResolvedValue({
      ok: true,
      attachments: [
        {
          id: 'att_hero',
          kind: 'reference_image',
          path: '/tmp/hero.png',
          name: 'hero.png',
          mimeType: 'image/png',
          size: 123,
        },
      ],
    });
    importReferenceImages.mockResolvedValue({
      ok: true,
      attachments: [
        {
          id: 'att_hero',
          kind: 'reference_image',
          path: '/projects/my-short/assets/uploads/characters/hero.png',
          name: 'hero.png',
          mimeType: 'image/png',
          size: 123,
          meta: {
            purpose: 'character_ref',
            referenceRole: 'character',
            projectRelativePath: 'assets/uploads/characters/hero.png',
            originalPath: '/tmp/hero.png',
            originalFilename: 'hero.png',
          },
        },
      ],
    });

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('YouTube Short'));
    fireEvent.click(screen.getByText('YouTube Short'));
    fireEvent.click(
      screen.getByRole('button', { name: /add character reference images/i }),
    );

    await waitFor(() => screen.getByText('hero.png'));
    fireEvent.change(screen.getByPlaceholderText('Short idea...'), {
      target: { value: 'A heroine maps a city through impossible lights.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^roll/i }));

    await waitFor(() => {
      expect(importReferenceImages).toHaveBeenCalledWith({
        projectDir: '/projects/my-short',
        attachments: [
          expect.objectContaining({
            path: '/tmp/hero.png',
            meta: expect.objectContaining({
              purpose: 'character_ref',
              referenceRole: 'character',
            }),
          }),
        ],
      });
      expect(initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImages: [
            expect.objectContaining({
              name: 'hero.png',
              relativePath: 'assets/uploads/characters/hero.png',
              purpose: 'character_ref',
              referenceRole: 'character',
            }),
          ],
        }),
      );
    });
  });

  it('uses a file picker for binary bundle file inputs', async () => {
    listBundles.mockResolvedValue([ugcProductBundle]);
    selectAttachment.mockResolvedValue({
      ok: true,
      attachment: {
        id: 'att_product',
        kind: 'image',
        path: '/tmp/product.png',
        name: 'product.png',
        mimeType: 'image/png',
        size: 456,
      },
    });

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('UGC Product Ad'));
    fireEvent.click(screen.getByText('UGC Product Ad'));
    fireEvent.change(screen.getByPlaceholderText('Type your story here...'), {
      target: { value: 'Create a premium coffee product advertisement.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /choose product photo/i }));
    await waitFor(() =>
      expect(selectAttachment).toHaveBeenCalledWith({
        kinds: ['image'],
        title: 'Select Product photo',
      }),
    );
    await waitFor(() => screen.getByText('product.png'));

    fireEvent.click(screen.getByRole('button', { name: /^roll/i }));

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'ugc_ad_product_v2',
          inputs: expect.objectContaining({
            product_image: {
              sourcePath: '/tmp/product.png',
              name: 'product.png',
              mimeType: 'image/png',
              size: 456,
            },
          }),
        }),
      );
    });
  });
});
