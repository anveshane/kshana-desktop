export interface WordTimestamp {
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface TextOverlayWord {
  text: string;
  startTime: number;
  endTime: number;
  charStart: number;
  charEnd: number;
}

export interface TextOverlayCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  words: TextOverlayWord[];
}

export interface PromptOverlayCue {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface ExpandedPlacementPromptEntry {
  placementNumber: number;
  startTime: string;
  endTime: string;
  originalPrompt: string;
  expandedPrompt: string;
  isExpanded: boolean;
  negativePrompt?: string;
}

export interface ExpandedPlacementPromptsFile {
  schemaVersion: 1;
  updatedAt: string;
  image: ExpandedPlacementPromptEntry[];
  video: ExpandedPlacementPromptEntry[];
}
