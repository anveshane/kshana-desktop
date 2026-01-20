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
   * CLI projects use .kshana/agent/project.json as the primary source
   * Desktop projects may also have kshana.json at root (optional)
   */
  async validateProject(directory: string): Promise<ProjectValidation> {
    const errors: string[] = [];

    // Check for agent state (required - this is the primary project file)
    const agentStatePath = `${directory}/${PROJECT_PATHS.AGENT_PROJECT}`;
    const hasAgentState = await this.fileExists(agentStatePath);
    if (!hasAgentState) {
      errors.push('Missing .kshana/agent/project.json file');
    }

    // Check for root manifest (optional - CLI doesn't create this)
    const manifestPath = `${directory}/${PROJECT_PATHS.ROOT_MANIFEST}`;
    const hasManifest = await this.fileExists(manifestPath);

    // Check for asset manifest
    const assetManifestPath = `${directory}/${PROJECT_PATHS.AGENT_MANIFEST}`;
    const hasAssetManifest = await this.fileExists(assetManifestPath);

    // Check for timeline state
    const timelinePath = `${directory}/${PROJECT_PATHS.UI_TIMELINE}`;
    const hasTimelineState = await this.fileExists(timelinePath);

    // Project is valid if it has agent state (CLI structure)
    return {
      isValid: hasAgentState,
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
    try {
      // Validate the project
      const validation = await this.validateProject(directory);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join('; '),
        };
      }

      // Read agent state (primary source - required)
      let agentState = await this.readAgentState(directory);
      if (!agentState) {
        return { success: false, error: 'Failed to read agent project file' };
      }

      // Read manifest (optional - generate from agent state if missing)
      let manifest = await this.readManifest(directory);
      if (!manifest) {
        // Generate manifest from agent state for backward compatibility
        manifest = createDefaultManifest(
          agentState.id,
          agentState.title || 'Untitled Project',
          '1.0.0',
        );
        await this.writeManifest(directory, manifest);
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
    try {
      // Create directory structure
      await this.createProjectStructure(directory);

      // Create agent state first (primary source)
      const projectId = `proj_${Date.now()}`;
      const agentState = createDefaultAgentProject(projectId, name);
      await this.writeAgentState(directory, agentState);

      // Create manifest (optional, for backward compatibility)
      const manifest = createDefaultManifest(projectId, name, '1.0.0');
      if (description) {
        manifest.description = description;
      }
      await this.writeManifest(directory, manifest);

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

    await this.writeAgentState(
      this.projectDirectory,
      this.currentProject.agentState,
    );

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

    await this.writeAgentState(
      this.projectDirectory,
      this.currentProject.agentState,
    );

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

    await this.writeTimelineState(this.projectDirectory, state);

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

    await this.writeAssetManifest(
      this.projectDirectory,
      this.currentProject.assetManifest,
    );

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

    await this.writeAssetManifest(this.projectDirectory, manifest);

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
    } catch (error) {
      console.error(`[ProjectService] Failed to read JSON from ${path}:`, error);
      return null;
    }
  }

  private async writeJSON(path: string, data: unknown): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await window.electron.project.writeFile(path, content);
    } catch (error) {
      console.error(`[ProjectService] Failed to write JSON to ${path}:`, error);
      throw new Error(`Failed to write file: ${(error as Error).message}`);
    }
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
