import type { TimelineItem } from '../../../hooks/useTimelineData';

export function isServerTimelineShotItem(
  item: TimelineItem | null | undefined,
): item is TimelineItem & {
  sourceType: 'server_timeline';
  sceneNumber: number;
  shotNumber: number;
  segmentId: string;
} {
  return Boolean(
    item &&
      item.sourceType === 'server_timeline' &&
      item.sceneNumber !== undefined &&
      item.shotNumber !== undefined &&
      item.segmentId,
  );
}

export function buildShotRegenerateDraft(item: TimelineItem): string {
  return buildShotRegenerateMessage(item, item.prompt?.trim() ?? '');
}

export function buildShotRegenerateMessage(
  item: TimelineItem,
  editedPrompt: string,
): string {
  const heading = `Regenerate Scene ${item.sceneNumber} Shot ${item.shotNumber}`;
  const segmentLine = `Segment ID: ${item.segmentId}`;
  const normalizedPrompt = editedPrompt.trim();

  if (normalizedPrompt) {
    return [
      heading,
      segmentLine,
      '',
      'Current shot prompt:',
      normalizedPrompt,
      '',
      'Revise this shot prompt, regenerate the shot, retrigger video generation for this same segment, and relink the result back to this timeline segment.',
    ].join('\n');
  }

  return [
    heading,
    segmentLine,
    '',
    'Current shot prompt: unavailable',
    '',
    'Inspect the current shot context for this segment, create an improved shot prompt, regenerate the shot, retrigger video generation for this same segment, and relink the result back to this timeline segment.',
  ].join('\n');
}
