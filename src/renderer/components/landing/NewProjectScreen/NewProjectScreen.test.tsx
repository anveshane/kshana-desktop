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

const openrouterMediaBundle = {
  id: 'openrouter_youtube_documentary',
  version: '0.1.0',
  bundleSource: 'user:openrouter_youtube_documentary',
  sourceScheme: 'user',
  displayName: 'OpenRouter Documentary',
  summary: 'Documentary generation with OpenRouter media models.',
  pickerEligible: true,
  inputs: [
    {
      id: 'story_input',
      kind: 'file',
      path: 'inputs/story.md',
      required: true,
      placeholder: 'Documentary idea...',
    },
    {
      id: 'imageModel',
      kind: 'project',
      field: 'imageModel',
      default: 'google/gemini-2.5-flash-image',
      label: 'Image Model',
      control: 'text',
      placeholder: 'google/gemini-2.5-flash-image',
    },
    {
      id: 'videoModel',
      kind: 'project',
      field: 'videoModel',
      default: 'google/veo-3.1',
      label: 'Video Model',
      control: 'text',
      placeholder: 'google/veo-3.1',
    },
  ],
};

const cloudMediaModels = {
  status: 'ok',
  image: [
    {
      id: 'bytedance-seed/seedream-4.5',
      provider: 'openrouter',
      label: 'Seedream 4.5',
      workflowId: null,
      modelId: 'bytedance-seed/seedream-4.5',
      unitType: 'run',
      runtimePriced: false,
      actualCostPriced: true,
      partnerCatalogPriced: false,
      creditsPerUnit: 17,
      pricingRuleId: 'openrouter-image-seedream-45',
    },
  ],
  video: [
    {
      id: 'bytedance/seedance-2.0',
      provider: 'openrouter',
      label: 'Seedance 2.0',
      workflowId: null,
      modelId: 'bytedance/seedance-2.0',
      unitType: 'second',
      runtimePriced: false,
      actualCostPriced: true,
      partnerCatalogPriced: false,
      creditsPerUnit: 28.2492,
      pricingRuleId: 'openrouter-video-seedance-20',
    },
  ],
};

describe('NewProjectScreen bundle packages', () => {
  const listBundles = jest.fn<() => Promise<unknown[]>>();
  const installBundlePackage =
    jest.fn<(payload: unknown) => Promise<unknown>>();
  const searchNpmBundles = jest.fn<(payload?: unknown) => Promise<unknown>>();
  const initialize =
    jest.fn<(payload: unknown) => Promise<{ ok: true; projectDir: string }>>();
  const createFolder = jest.fn<() => Promise<string | null>>();
  const selectAttachment = jest.fn<(payload: unknown) => Promise<unknown>>();
  const importReferenceImages =
    jest.fn<(payload: unknown) => Promise<unknown>>();
  const getCloudModels = jest.fn<() => Promise<unknown>>();

  beforeEach(() => {
    mockOpenProject.mockReset();
    listBundles.mockReset();
    installBundlePackage.mockReset();
    searchNpmBundles.mockReset();
    initialize.mockReset();
    createFolder.mockReset();
    selectAttachment.mockReset();
    importReferenceImages.mockReset();
    getCloudModels.mockReset();
    window.sessionStorage.clear();

    mockOpenProject.mockResolvedValue(undefined);
    createFolder.mockResolvedValue('/projects/my-short');
    initialize.mockResolvedValue({
      ok: true,
      projectDir: '/projects/my-short',
    });
    selectAttachment.mockResolvedValue({ ok: false });
    importReferenceImages.mockResolvedValue({ ok: true, attachments: [] });
    getCloudModels.mockResolvedValue({
      status: 'signed_out',
      image: [],
      video: [],
    });
    // The picker auto-searches npm on open — default to no published hits.
    searchNpmBundles.mockResolvedValue({ ok: true, hits: [] });

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        settings: {
          get: async () => ({ comfyuiMode: 'local', comfyuiUrl: '' }),
        },
        bundleConfig: {
          check: async () => ({ error: 'ComfyUI not connected in test' }),
          resolution: async () => null,
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
        cloudModels: {
          get: getCloudModels,
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
    fireEvent.click(
      screen.getByRole('button', { name: /install \+ runners/i }),
    );

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

  it('renders cloud media model dropdowns and persists selected OpenRouter model ids', async () => {
    listBundles.mockResolvedValue([openrouterMediaBundle]);
    getCloudModels.mockResolvedValue(cloudMediaModels);

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('OpenRouter Documentary'));
    fireEvent.click(screen.getByText('OpenRouter Documentary'));

    const imageSelect = await screen.findByRole('combobox', {
      name: /image model/i,
    });
    const videoSelect = await screen.findByRole('combobox', {
      name: /video model/i,
    });

    expect(
      screen.getByRole('option', {
        name: /bytedance-seed\/seedream-4\.5/i,
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole('option', {
        name: /bytedance\/seedance-2\.0/i,
      }),
    ).not.toBeNull();

    fireEvent.change(imageSelect, {
      target: { value: 'bytedance-seed/seedream-4.5' },
    });
    fireEvent.change(videoSelect, {
      target: { value: 'bytedance/seedance-2.0' },
    });
    fireEvent.change(screen.getByPlaceholderText('Documentary idea...'), {
      target: {
        value: 'A filmmaker investigates a hidden archive beneath the city.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /^roll/i }));

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'openrouter_youtube_documentary',
          inputs: expect.objectContaining({
            imageModel: 'bytedance-seed/seedream-4.5',
            videoModel: 'bytedance/seedance-2.0',
          }),
        }),
      );
    });
  });

  it('falls back to text model inputs when the user is signed out', async () => {
    listBundles.mockResolvedValue([openrouterMediaBundle]);
    getCloudModels.mockResolvedValue({
      status: 'signed_out',
      image: [],
      video: [],
    });

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('OpenRouter Documentary'));
    fireEvent.click(screen.getByText('OpenRouter Documentary'));

    await waitFor(() => {
      expect(screen.getByLabelText(/image model/i).getAttribute('type')).toBe(
        'text',
      );
      expect(screen.getByLabelText(/video model/i).getAttribute('type')).toBe(
        'text',
      );
    });
    expect(screen.queryByRole('combobox', { name: /image model/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /video model/i })).toBeNull();
  });

  it('falls back to text model inputs when cloud model lookup fails', async () => {
    listBundles.mockResolvedValue([openrouterMediaBundle]);
    getCloudModels.mockRejectedValue(new Error('network down'));

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('OpenRouter Documentary'));
    fireEvent.click(screen.getByText('OpenRouter Documentary'));

    await waitFor(() => {
      expect(screen.getByLabelText(/image model/i).getAttribute('type')).toBe(
        'text',
      );
      expect(screen.getByLabelText(/video model/i).getAttribute('type')).toBe(
        'text',
      );
    });
  });

  it('keeps text model inputs when the bundle allows custom model ids', async () => {
    const customModelBundle = {
      ...openrouterMediaBundle,
      inputs: openrouterMediaBundle.inputs.map((input) =>
        input.id === 'imageModel' || input.id === 'videoModel'
          ? { ...input, allowCustom: true }
          : input,
      ),
    };
    listBundles.mockResolvedValue([customModelBundle]);
    getCloudModels.mockResolvedValue(cloudMediaModels);

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('OpenRouter Documentary'));
    fireEvent.click(screen.getByText('OpenRouter Documentary'));

    await waitFor(() => {
      expect(screen.getByLabelText(/image model/i).getAttribute('type')).toBe(
        'text',
      );
      expect(screen.getByLabelText(/video model/i).getAttribute('type')).toBe(
        'text',
      );
    });
    expect(screen.queryByRole('combobox', { name: /image model/i })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /video model/i })).toBeNull();
  });

  it('leaves existing non-media project inputs unchanged', async () => {
    listBundles.mockResolvedValue([youtubeBundle]);
    getCloudModels.mockResolvedValue(cloudMediaModels);

    render(<NewProjectScreen isOpen onClose={jest.fn()} />);

    await waitFor(() => screen.getByText('YouTube Short'));
    fireEvent.click(screen.getByText('YouTube Short'));

    await waitFor(() => screen.getByText('Duration'));
    expect(screen.getByRole('button', { name: '30s' })).not.toBeNull();
    expect(screen.queryByRole('combobox', { name: /duration/i })).toBeNull();
  });
});
