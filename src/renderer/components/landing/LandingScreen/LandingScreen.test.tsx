import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LandingScreen from './LandingScreen';

const mockOpenProject = jest.fn<(path: string) => Promise<void>>();
const mockRefreshRecentProjects = jest.fn<() => Promise<void>>();
const mockUpdateTheme = jest.fn<(themeId: string) => Promise<void>>();
const mockSaveConnectionSettings = jest.fn<() => Promise<boolean>>();
const mockClearError = jest.fn<() => void>();
let mockProjectLoading = false;

const recentProjects = [
  {
    path: '/projects/demo',
    name: 'Demo',
    lastOpened: Date.now(),
  },
];

jest.mock('../../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    recentProjects,
    openProject: mockOpenProject,
    refreshRecentProjects: mockRefreshRecentProjects,
    isLoading: false,
  }),
}));

jest.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    isLoading: mockProjectLoading,
  }),
}));

jest.mock('../../../contexts/AppSettingsContext', () => ({
  useAppSettings: () => ({
    themeId: 'studio-neutral',
    settings: {},
    updateTheme: mockUpdateTheme,
    saveConnectionSettings: mockSaveConnectionSettings,
    isSavingConnection: false,
    error: null,
    clearError: mockClearError,
  }),
}));

jest.mock('../../SettingsPanel', () => () => null);
jest.mock('../NewProjectDialog/NewProjectDialog', () => () => null);

describe('LandingScreen', () => {
  const mockReadFile = jest.fn<(path: string) => Promise<string | null>>();
  const mockCheckFileExists = jest.fn<(path: string) => Promise<boolean>>();
  const mockRenameProject =
    jest.fn<(projectPath: string, newName: string) => Promise<string>>();
  const mockDeleteProject = jest.fn<(projectPath: string) => Promise<void>>();
  const mockGetVersion = jest.fn<() => Promise<string>>();

  beforeEach(() => {
    mockOpenProject.mockReset();
    mockRefreshRecentProjects.mockReset();
    mockUpdateTheme.mockReset();
    mockSaveConnectionSettings.mockReset();
    mockClearError.mockReset();
    mockReadFile.mockReset();
    mockCheckFileExists.mockReset();
    mockRenameProject.mockReset();
    mockDeleteProject.mockReset();
    mockGetVersion.mockReset();
    mockProjectLoading = false;

    mockReadFile.mockResolvedValue(
      JSON.stringify({
        title: 'Stale Manifest Title',
        description: 'Test project',
        scenes: [],
        characters: [],
      }),
    );
    mockCheckFileExists.mockResolvedValue(false);
    mockRenameProject.mockResolvedValue('/projects/demo-renamed');
    mockDeleteProject.mockResolvedValue(undefined);
    mockRefreshRecentProjects.mockResolvedValue(undefined);
    mockGetVersion.mockResolvedValue('1.0.0');

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        project: {
          readFile: mockReadFile,
          checkFileExists: mockCheckFileExists,
          renameProject: mockRenameProject,
          deleteProject: mockDeleteProject,
          selectDirectory: jest.fn(),
        },
        app: {
          getVersion: mockGetVersion,
        },
      },
    });
  });

  it('keeps new project available while project work is loading', async () => {
    mockProjectLoading = true;

    render(<LandingScreen />);

    expect(
      (await screen.findByRole('button', {
        name: 'New Project',
      })) as HTMLButtonElement,
    ).toHaveProperty('disabled', false);
  });

  it('opens the rename dialog from the project card and submits rename', async () => {
    render(<LandingScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Rename demo' }));
    expect(
      screen.getByRole('dialog', { name: 'Rename project' }),
    ).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Demo Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Project' }));

    await waitFor(() => {
      expect(mockRenameProject).toHaveBeenCalledWith(
        '/projects/demo',
        'Demo Renamed',
      );
    });
    expect(mockRefreshRecentProjects).toHaveBeenCalled();
  });

  it('uses the project folder name instead of a stale manifest title', async () => {
    render(<LandingScreen />);

    expect(await screen.findByText('demo')).not.toBeNull();
    expect(screen.queryByText('Stale Manifest Title')).toBeNull();
  });

  it('opens the delete dialog from the project card and submits delete', async () => {
    render(<LandingScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete demo' }));
    expect(
      screen.getByRole('dialog', { name: 'Delete project' }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Project' }));

    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalledWith('/projects/demo');
    });
    expect(mockRefreshRecentProjects).toHaveBeenCalled();
  });
});
