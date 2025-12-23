/**
 * Project Service
 * Orchestrates project operations including loading, saving, and managing project state
 */

import type {
  KshanaProject,
  KshanaManifest,
  AgentProjectFile,
  AssetManifest,
  KshanaTimelineState,
  ContextIndex,
  WorkflowPhase,
  ItemApprovalStatus,
  AssetInfo,
  AssetType,
} from '../../types/kshana';
import {
  PROJECT_PATHS,
  DEFAULT_TIMELINE_STATE,
  createDefaultManifest,
  createDefaultAgentProject,
  createDefaultAssetManifest,
  createDefaultContextIndex,
  createAssetInfo,
} from '../../types/kshana';
import { createMockKshanaProject, createEmptyKshanaProject } from './mockData';
import { generateMockProjectStructure } from './mockData/generateMockStructure';

/**
 * Result type for async operations
 */
export type ProjectResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Project validation result
 */
export interface ProjectValidation {
  isValid: boolean;
  hasManifest: boolean;
  hasAgentState: boolean;
  hasAssetManifest: boolean;
  hasTimelineState: boolean;
  errors: string[];
}

/**
 * Project Service class
 * Handles all project-related operations
 */
export class ProjectService {
  private projectDirectory: string | null = null;

  private currentProject: KshanaProject | null = null;

  private useMockData: boolean = false;

  /**
   * Sets whether to use mock data instead of real file system
   */
  setUseMockData(useMock: boolean): void {
    this.useMockData = useMock;
  }

  /**
   * Gets the current project directory
   */
  getProjectDirectory(): string | null {
    return this.projectDirectory;
  }

  /**
   * Gets the current project
   */
  getCurrentProject(): KshanaProject | null {
    return this.currentProject;
  }

  /**
   * Validates if a directory is a valid Kshana project
   */
  async validateProject(directory: string): Promise<ProjectValidation> {
    const errors: string[] = [];

    // Check for root manifest
    const manifestPath = `${directory}/${PROJECT_PATHS.ROOT_MANIFEST}`;
    const hasManifest = await this.fileExists(manifestPath);
    if (!hasManifest) {
      errors.push('Missing kshana.json manifest file');
    }

    // Check for agent state
    const agentStatePath = `${directory}/${PROJECT_PATHS.AGENT_PROJECT}`;
    const hasAgentState = await this.fileExists(agentStatePath);

    // Check for asset manifest
    const assetManifestPath = `${directory}/${PROJECT_PATHS.AGENT_MANIFEST}`;
    const hasAssetManifest = await this.fileExists(assetManifestPath);

    // Check for timeline state
    const timelinePath = `${directory}/${PROJECT_PATHS.UI_TIMELINE}`;
    const hasTimelineState = await this.fileExists(timelinePath);

    return {
      isValid: hasManifest,
      hasManifest,
      hasAgentState,
      hasAssetManifest,
      hasTimelineState,
      errors,
    };
  }

  /**
   * Opens a project from the given directory
   */
  async openProject(directory: string): Promise<ProjectResult<KshanaProject>> {
    // Use mock data if enabled - write it to disk so user can see the structure
    if (this.useMockData) {
      try {
        // Create project structure first
        await this.createProjectStructure(directory);

        // Generate mock asset structure (characters, settings, props, plans)
        await generateMockProjectStructure(directory);

        // Generate mock project data
        const mockProject = createMockKshanaProject();

        // Write all mock data files to disk
        await this.writeManifest(directory, mockProject.manifest);
        await this.writeAgentState(directory, mockProject.agentState);
        await this.writeAssetManifest(directory, mockProject.assetManifest);
        await this.writeTimelineState(directory, mockProject.timelineState);

        // Write context index if it exists
        if (mockProject.contextIndex) {
          await this.writeJSON(
            `${directory}/${PROJECT_PATHS.CONTEXT_INDEX}`,
            mockProject.contextIndex,
          );
        }

        this.projectDirectory = directory;
        this.currentProject = mockProject;
        return { success: true, data: this.currentProject };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to create mock project',
        };
      }
    }

    try {
      // Validate the project
      const validation = await this.validateProject(directory);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join('; '),
        };
      }

      // Read manifest (required)
      const manifest = await this.readManifest(directory);
      if (!manifest) {
        return { success: false, error: 'Failed to read project manifest' };
      }

      // Read agent state (create default if missing)
      let agentState = await this.readAgentState(directory);
      if (!agentState) {
        agentState = createDefaultAgentProject(manifest.id, manifest.name);
        await this.writeAgentState(directory, agentState);
      }

      // Read asset manifest (create default if missing)
      let assetManifest = await this.readAssetManifest(directory);
      if (!assetManifest) {
        assetManifest = createDefaultAssetManifest();
        await this.writeAssetManifest(directory, assetManifest);
      }

      // Read timeline state (use default if missing)
      let timelineState = await this.readTimelineState(directory);
      if (!timelineState) {
        timelineState = { ...DEFAULT_TIMELINE_STATE };
      }

      // Read context index (create default if missing)
      let contextIndex = await this.readContextIndex(directory);
      if (!contextIndex) {
        contextIndex = createDefaultContextIndex();
      }

      this.projectDirectory = directory;
      this.currentProject = {
        manifest,
        agentState,
        assetManifest,
        timelineState,
        contextIndex,
      };

      return { success: true, data: this.currentProject };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Creates a new project in the given directory
   */
  async createProject(
    directory: string,
    name: string,
    description?: string,
  ): Promise<ProjectResult<KshanaProject>> {
    if (this.useMockData) {
      this.projectDirectory = directory;
      this.currentProject = createEmptyKshanaProject(name, description);
      return { success: true, data: this.currentProject };
    }

    try {
      // Create directory structure
      await this.createProjectStructure(directory);

      // Create manifest
      const manifest = createDefaultManifest(
        `proj_${Date.now()}`,
        name,
        '1.0.0',
      );
      if (description) {
        manifest.description = description;
      }
      await this.writeManifest(directory, manifest);

      // Create agent state
      const agentState = createDefaultAgentProject(manifest.id, name);
      await this.writeAgentState(directory, agentState);

      // Create asset manifest
      const assetManifest = createDefaultAssetManifest();
      await this.writeAssetManifest(directory, assetManifest);

      // Timeline state will be created on first use

      this.projectDirectory = directory;
      this.currentProject = {
        manifest,
        agentState,
        assetManifest,
        timelineState: { ...DEFAULT_TIMELINE_STATE },
        contextIndex: createDefaultContextIndex(),
      };

      return { success: true, data: this.currentProject };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Closes the current project
   */
  closeProject(): void {
    this.projectDirectory = null;
    this.currentProject = null;
  }

  /**
   * Updates the workflow phase
   */
  async updatePhase(phase: WorkflowPhase): Promise<ProjectResult<void>> {
    if (!this.currentProject || !this.projectDirectory) {
      return { success: false, error: 'No project open' };
    }

    this.currentProject.agentState.current_phase = phase;
    this.currentProject.agentState.updated_at = Date.now();

    if (!this.useMockData) {
      await this.writeAgentState(
        this.projectDirectory,
        this.currentProject.agentState,
      );
    }

    return { success: true, data: undefined };
  }

  /**
   * Updates scene approval status
   */
  async updateSceneApproval(
    sceneNumber: number,
    field: 'content' | 'image' | 'video' | 'audio',
    status: ItemApprovalStatus,
  ): Promise<ProjectResult<void>> {
    if (!this.currentProject || !this.projectDirectory) {
      return { success: false, error: 'No project open' };
    }

    const scene = this.currentProject.agentState.scenes.find(
      (s) => s.scene_number === sceneNumber,
    );
    if (!scene) {
      return { success: false, error: `Scene ${sceneNumber} not found` };
    }

    const statusKey = `${field}_approval_status` as keyof typeof scene;
    (scene as unknown as Record<string, unknown>)[statusKey] = status;

    if (status === 'approved') {
      const approvedKey = `${field}_approved_at` as keyof typeof scene;
      (scene as unknown as Record<string, unknown>)[approvedKey] = Date.now();
    }

    this.currentProject.agentState.updated_at = Date.now();

    if (!this.useMockData) {
      await this.writeAgentState(
        this.projectDirectory,
        this.currentProject.agentState,
      );
    }

    return { success: true, data: undefined };
  }

  /**
   * Saves timeline state
   */
  async saveTimelineState(
    state: KshanaTimelineState,
  ): Promise<ProjectResult<void>> {
    if (!this.currentProject || !this.projectDirectory) {
      return { success: false, error: 'No project open' };
    }

    this.currentProject.timelineState = state;

    if (!this.useMockData) {
      await this.writeTimelineState(this.projectDirectory, state);
    }

    return { success: true, data: undefined };
  }

  /**
   * Adds an asset to the asset manifest
   */
  async addAssetToManifest(
    assetInfo: AssetInfo,
  ): Promise<ProjectResult<AssetInfo>> {
    if (!this.currentProject || !this.projectDirectory) {
      return { success: false, error: 'No project open' };
    }

    // Check if asset with same ID already exists
    const existingIndex = this.currentProject.assetManifest.assets.findIndex(
      (asset) => asset.id === assetInfo.id,
    );

    if (existingIndex >= 0) {
      // Update existing asset
      this.currentProject.assetManifest.assets[existingIndex] = assetInfo;
    } else {
      // Add new asset
      this.currentProject.assetManifest.assets.push(assetInfo);
    }

    if (!this.useMockData) {
      await this.writeAssetManifest(
        this.projectDirectory,
        this.currentProject.assetManifest,
      );
    }

    return { success: true, data: assetInfo };
  }

  /**
   * Updates the asset manifest
   */
  async updateAssetManifest(
    manifest: AssetManifest,
  ): Promise<ProjectResult<void>> {
    if (!this.currentProject || !this.projectDirectory) {
      return { success: false, error: 'No project open' };
    }

    this.currentProject.assetManifest = manifest;

    if (!this.useMockData) {
      await this.writeAssetManifest(this.projectDirectory, manifest);
    }

    return { success: true, data: undefined };
  }

  // === Private helper methods ===

  private async fileExists(path: string): Promise<boolean> {
    try {
      await window.electron.project.readFile(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readJSON<T>(path: string): Promise<T | null> {
    try {
      const content = await window.electron.project.readFile(path);
      if (content === null) return null;
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private async writeJSON(path: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await window.electron.project.writeFile(path, content);
  }

  private async readManifest(
    directory: string,
  ): Promise<KshanaManifest | null> {
    return this.readJSON<KshanaManifest>(
      `${directory}/${PROJECT_PATHS.ROOT_MANIFEST}`,
    );
  }

  private async writeManifest(
    directory: string,
    manifest: KshanaManifest,
  ): Promise<void> {
    manifest.updated_at = new Date().toISOString();
    await this.writeJSON(
      `${directory}/${PROJECT_PATHS.ROOT_MANIFEST}`,
      manifest,
    );
  }

  private async readAgentState(
    directory: string,
  ): Promise<AgentProjectFile | null> {
    return this.readJSON<AgentProjectFile>(
      `${directory}/${PROJECT_PATHS.AGENT_PROJECT}`,
    );
  }

  private async writeAgentState(
    directory: string,
    state: AgentProjectFile,
  ): Promise<void> {
    state.updated_at = Date.now();
    await this.writeJSON(`${directory}/${PROJECT_PATHS.AGENT_PROJECT}`, state);
  }

  private async readAssetManifest(
    directory: string,
  ): Promise<AssetManifest | null> {
    return this.readJSON<AssetManifest>(
      `${directory}/${PROJECT_PATHS.AGENT_MANIFEST}`,
    );
  }

  private async writeAssetManifest(
    directory: string,
    manifest: AssetManifest,
  ): Promise<void> {
    await this.writeJSON(
      `${directory}/${PROJECT_PATHS.AGENT_MANIFEST}`,
      manifest,
    );
  }

  private async readTimelineState(
    directory: string,
  ): Promise<KshanaTimelineState | null> {
    return this.readJSON<KshanaTimelineState>(
      `${directory}/${PROJECT_PATHS.UI_TIMELINE}`,
    );
  }

  private async writeTimelineState(
    directory: string,
    state: KshanaTimelineState,
  ): Promise<void> {
    await this.writeJSON(`${directory}/${PROJECT_PATHS.UI_TIMELINE}`, state);
  }

  private async readContextIndex(
    directory: string,
  ): Promise<ContextIndex | null> {
    return this.readJSON<ContextIndex>(
      `${directory}/${PROJECT_PATHS.CONTEXT_INDEX}`,
    );
  }

  private async createProjectStructure(directory: string): Promise<void> {
    const dirs = [
      PROJECT_PATHS.VIDEOS_IMPORTED,
      PROJECT_PATHS.EXPORTS,
      PROJECT_PATHS.AGENT_DIR,
      PROJECT_PATHS.AGENT_PLANS,
      PROJECT_PATHS.AGENT_CHARACTERS,
      PROJECT_PATHS.AGENT_SETTINGS,
      PROJECT_PATHS.AGENT_SCENES,
      PROJECT_PATHS.AGENT_MUSIC,
      PROJECT_PATHS.AGENT_FINAL,
      PROJECT_PATHS.UI_DIR,
      PROJECT_PATHS.CONTEXT_DIR,
      PROJECT_PATHS.CONTEXT_CHUNKS,
    ];

    for (const dir of dirs) {
      // createFolder expects basePath and relativePath
      // Create nested folders step by step to ensure proper path resolution
      const parts = dir.split('/');
      let basePath = directory;
      for (const part of parts) {
        if (part) {
          const newPath = await window.electron.project.createFolder(
            basePath,
            part,
          );
          // Use the returned normalized path for the next iteration
          // This ensures we don't accumulate path errors or duplicates
          if (newPath) {
            basePath = newPath;
          } else {
            // Fallback for safety (though main process should throw or return path)
            basePath = basePath.endsWith('/')
              ? `${basePath}${part}`
              : `${basePath}/${part}`;
          }
        }
      }
    }
  }
}

/**
 * Singleton instance of ProjectService
 */
export const projectService = new ProjectService();

export default projectService;
