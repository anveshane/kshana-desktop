export interface AppSettings {
  /** URL of the ComfyUI server the user wants to use. */
  comfyuiUrl: string;
  /** Fixed internally at 1800 seconds; not user-editable in UI. */
  comfyuiTimeout: number;
  projectDir?: string;
}
