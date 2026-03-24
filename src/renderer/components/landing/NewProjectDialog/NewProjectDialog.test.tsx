import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewProjectDialog from './NewProjectDialog';

const mockCreateProject = jest.fn();
const mockOpenProject = jest.fn();

jest.mock('../../../contexts/ProjectContext', () => ({
  useProject: () => ({
    createProject: mockCreateProject,
    error: null,
    isLoading: false,
  }),
}));

jest.mock('../../../contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    openProject: mockOpenProject,
  }),
}));

describe('NewProjectDialog', () => {
  const mockSelectDirectory = jest.fn();
  const mockCreateFolder = jest.fn();
  const mockCheckFileExists = jest.fn();

  beforeEach(() => {
    mockCreateProject.mockReset();
    mockOpenProject.mockReset();
    mockSelectDirectory.mockReset();
    mockCreateFolder.mockReset();
    mockCheckFileExists.mockReset();

    mockCreateProject.mockResolvedValue(true);
    mockOpenProject.mockResolvedValue(undefined);
    mockCreateFolder.mockResolvedValue('/projects/demo');

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        project: {
          selectDirectory: mockSelectDirectory,
          createFolder: mockCreateFolder,
          checkFileExists: mockCheckFileExists,
        },
      },
    });
  });

  async function pickFolder(path: string) {
    mockSelectDirectory.mockResolvedValue(path);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Folder' }));
    await waitFor(() => {
      expect(screen.getByText(path)).not.toBeNull();
    });
  }

  it('shows an error when the selected directory is already a project', async () => {
    mockCheckFileExists.mockImplementation(async (path: string) => {
      return path === '/projects/existing/project.json';
    });

    const onClose = jest.fn();
    render(<NewProjectDialog isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'demo' },
    });
    await pickFolder('/projects/existing');

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Selected location is already a Kshana project. Choose a parent folder instead.',
        ),
      ).not.toBeNull();
    });

    expect(mockOpenProject).not.toHaveBeenCalled();
    expect(mockCreateFolder).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows an error when the target project name already exists', async () => {
    mockCheckFileExists.mockImplementation(async (path: string) => {
      return path === '/projects/demo/project.json';
    });

    const onClose = jest.fn();
    render(<NewProjectDialog isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'demo' },
    });
    await pickFolder('/projects');

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'A project named "demo" already exists in the selected location.',
        ),
      ).not.toBeNull();
    });

    expect(mockOpenProject).not.toHaveBeenCalled();
    expect(mockCreateFolder).not.toHaveBeenCalled();
    expect(mockCreateProject).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('creates a new project when no existing project is found', async () => {
    mockCheckFileExists.mockResolvedValue(false);

    const onClose = jest.fn();
    render(<NewProjectDialog isOpen onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText('Project description'), {
      target: { value: 'A test project' },
    });
    await pickFolder('/projects');

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

    await waitFor(() => {
      expect(mockCreateFolder).toHaveBeenCalledWith('/projects', 'demo');
    });
    expect(mockCreateProject).toHaveBeenCalledWith(
      '/projects/demo',
      'demo',
      'A test project',
    );
    expect(mockOpenProject).toHaveBeenCalledWith('/projects/demo');
    expect(onClose).toHaveBeenCalled();
  });
});
