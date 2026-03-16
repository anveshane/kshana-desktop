export type ComfyUIMode = 'inherit' | 'custom';
export type ThemeId =
  | 'studio-neutral'
  | 'deep-forest-gold'
  | 'petroleum-clay'
  | 'paper-light'
  | 'void-cut';

export interface AppSettings {
  /** Whether to inherit backend COMFYUI_BASE_URL or use a desktop override URL. */
  comfyuiMode: ComfyUIMode;
  /** URL of the ComfyUI server the user wants to use. */
  comfyuiUrl: string;
  /** Fixed internally at 1800 seconds; not user-editable in UI. */
  comfyuiTimeout: number;
  /** Global desktop theme selection. */
  themeId: ThemeId;
  projectDir?: string;
}
