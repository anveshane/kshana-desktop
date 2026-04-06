export function getThumbnailPreviewTime(duration: number | undefined): number {
  if (!Number.isFinite(duration) || (duration ?? 0) <= 0) return 0;

  const safeDuration = duration ?? 0;
  return Math.max(0, Math.min(safeDuration * 0.12, safeDuration - 0.05));
}

export function getVisibleVideoTime(options: {
  desiredTime: number;
  sourceOffset?: number;
  clipDuration?: number;
}): number {
  const sourceOffset = options.sourceOffset ?? 0;
  const clipDuration = options.clipDuration ?? 0;
  const clipEnd = sourceOffset + clipDuration;
  const minimumVisibleTime =
    clipDuration > 0
      ? Math.min(sourceOffset + 0.08, clipEnd - 0.05)
      : sourceOffset;

  if (!Number.isFinite(options.desiredTime)) {
    return Math.max(0, minimumVisibleTime);
  }

  const boundedDesiredTime =
    clipDuration > 0
      ? Math.max(sourceOffset, Math.min(options.desiredTime, clipEnd))
      : Math.max(0, options.desiredTime);

  if (clipDuration <= 0) {
    return boundedDesiredTime;
  }

  return Math.max(boundedDesiredTime, minimumVisibleTime);
}
