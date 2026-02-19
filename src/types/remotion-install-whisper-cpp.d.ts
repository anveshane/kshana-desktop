declare module '@remotion/install-whisper-cpp' {
  export type WhisperModel =
    | 'tiny'
    | 'tiny.en'
    | 'base'
    | 'base.en'
    | 'small'
    | 'small.en'
    | 'medium'
    | 'medium.en'
    | 'large-v1'
    | 'large-v2'
    | 'large-v3'
    | 'large-v3-turbo';

  export interface InstallWhisperCppOptions {
    to: string;
    version?: string;
    printOutput?: boolean;
    signal?: AbortSignal;
  }

  export interface DownloadWhisperModelOptions {
    folder: string;
    model: WhisperModel;
    printOutput?: boolean;
    signal?: AbortSignal;
    onProgress?: (downloadedBytes: number, totalBytes: number) => void;
  }

  export interface TranscribeOptions {
    inputPath: string;
    whisperPath: string;
    tokenLevelTimestamps?: boolean;
    model?: WhisperModel;
    modelFolder?: string;
    translateToEnglish?: boolean;
    printOutput?: boolean;
    tokensPerItem?: number | null;
    splitOnWord?: boolean;
    language?: string;
    signal?: AbortSignal;
    onProgress?: (progress: number) => void;
    flashAttention?: boolean;
    additionalArgs?: string[];
    whisperCppVersion?: string;
  }

  export interface TranscriptionToken {
    text: string;
    timestamps?: {
      from: number;
      to: number;
    };
    t_dtw?: number;
  }

  export interface TranscriptionItem {
    text: string;
    tokens?: TranscriptionToken[];
    offsets?: {
      from: number;
      to: number;
    };
    timestamps?: {
      from: number;
      to: number;
    };
  }

  export interface TranscribeResult {
    transcription: TranscriptionItem[];
  }

  export function installWhisperCpp(
    options: InstallWhisperCppOptions,
  ): Promise<{ alreadyExisted: boolean }>;

  export function downloadWhisperModel(
    options: DownloadWhisperModelOptions,
  ): Promise<{ alreadyExisted: boolean }>;

  export function transcribe(
    options: TranscribeOptions,
  ): Promise<TranscribeResult>;
}

