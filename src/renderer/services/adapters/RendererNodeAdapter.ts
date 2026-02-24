import type { TimelineTrack, TimelineTrackElement } from '../../types/kshana/timeline';

export interface PreviewSceneNode {
  id: string;
  type: TimelineTrackElement['type'];
  trackType: TimelineTrack['type'];
  name: string;
  startTimeSeconds: number;
  durationSeconds: number;
  sourcePath?: string;
  textContent?: string;
  stickerId?: string;
  svgContent?: string;
  shapeType?: string;
  metadata?: TimelineTrackElement['metadata'];
}

function toNode(
  track: TimelineTrack,
  element: TimelineTrackElement,
): PreviewSceneNode {
  const base: PreviewSceneNode = {
    id: element.id,
    type: element.type,
    trackType: track.type,
    name: element.name,
    startTimeSeconds: element.start_time_seconds,
    durationSeconds: element.duration_seconds,
    metadata: element.metadata,
  };

  if (element.type === 'video' || element.type === 'image' || element.type === 'audio') {
    return {
      ...base,
      sourcePath: element.source_path,
    };
  }

  if (element.type === 'text') {
    return {
      ...base,
      textContent: element.content,
    };
  }

  if (element.type === 'sticker') {
    return {
      ...base,
      stickerId: element.sticker_id,
    };
  }

  if (element.type === 'svg') {
    return {
      ...base,
      svgContent: element.svg_content,
    };
  }

  return {
    ...base,
    shapeType: element.type === 'shape' ? element.shape_type : undefined,
  };
}

export function mapTimelineTracksToPreviewNodes(
  tracks: TimelineTrack[],
): PreviewSceneNode[] {
  return tracks
    .flatMap((track) => track.elements.map((element) => toNode(track, element)))
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
}
