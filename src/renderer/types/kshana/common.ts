/**
 * Common types and enums for Kshana Project Directory
 * Based on Kshana Project Directory Specification v1.0
 */

/**
 * Workflow phases representing the video generation pipeline
 */
export type WorkflowPhase =
  | 'plot'
  | 'story'
  | 'characters_settings'
  | 'scenes'
  | 'character_setting_images'
  | 'scene_images'
  | 'video'
  | 'audio'
  | 'captions'
  | 'video_combine'
  | 'completed';

/**
 * Status of a workflow phase
 */
export type PhaseStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Stage within the planning process
 */
export type PlannerStage = 'planning' | 'verify' | 'refining' | 'complete';

/**
 * Approval status for individual items (characters, scenes, etc.)
 */
export type ItemApprovalStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'regenerating';

/**
 * Content availability status
 */
export type ContentStatus = 'available' | 'partial' | 'missing';

/**
 * Context source types
 */
export type ContextSource = 'user_input' | 'tool' | 'manual';

/**
 * Schema version constant
 */
export const SCHEMA_VERSION = '1' as const;

/**
 * Agent project file version
 */
export const AGENT_PROJECT_VERSION = '2.0' as const;
