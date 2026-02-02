/**
 * Shared types for Remotion integration between main and renderer processes.
 */

export interface RemotionPlacement {
  placementNumber: number;
  startTime: string;
  endTime: string;
  infographicType:
    | 'statistic'
    | 'list'
    | 'bar_chart'
    | 'line_chart'
    | 'diagram';
  prompt: string;
  componentName: string;
}

export interface RemotionRenderInput {
  placements: RemotionPlacement[];
}

export interface RemotionJob {
  id: string;
  projectDirectory: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  outputFiles: string[];
  error?: string;
  tempDir?: string;
}

export interface RemotionProgress {
  jobId: string;
  placementIndex: number;
  totalPlacements: number;
  progress: number;
  stage: 'rendering' | 'encoding' | 'finalizing';
}

export interface RemotionTimelineItem {
  id: string;
  type: 'infographic';
  startTime: number;
  endTime: number;
  duration: number;
  label: string;
  prompt?: string;
  placementNumber?: number;
  videoPath?: string;
}

export interface ParsedInfographicPlacement {
  placementNumber: number;
  startTime: string;
  endTime: string;
  infographicType:
    | 'bar_chart'
    | 'line_chart'
    | 'diagram'
    | 'statistic'
    | 'list';
  prompt: string;
}
