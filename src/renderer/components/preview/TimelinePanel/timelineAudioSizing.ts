export const MIN_AUDIO_BLOCK_WIDTH_PX = 8;
const BASE_PIXELS_PER_SECOND = 50;

export function getAudioBlockWidthPx({
  duration,
  zoomLevel,
}: {
  duration: number;
  zoomLevel: number;
}): number {
  const width = duration * BASE_PIXELS_PER_SECOND * zoomLevel;
  return Math.max(width, MIN_AUDIO_BLOCK_WIDTH_PX);
}
