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

