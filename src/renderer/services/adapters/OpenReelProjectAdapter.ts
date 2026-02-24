import type { AssetInfo, KshanaTimelineState, TimelineTrack } from '../../types/kshana';
import type {
  TimelineElementMetadata,
  TimelineKeyframeProperty,
  TimelineMarker,
  TimelineTextElement,
  TimelineTrackElement,
  TimelineTransform,
} from '../../types/kshana/timeline';
import {
  appendImportedMediaToTimelineState,
  importedMediaToAssetInfo,
  importMediaToProject,
  replaceMediaInProject,
  type ImportedMediaData,
} from '../media';

export interface OpenReelProjectAdapterDeps {
  getTimelineState: () => KshanaTimelineState;
  updateTimelineTracks: (tracks: TimelineTrack[]) => void;
  updateMarkers: (markers: TimelineMarker[]) => void;
  addAsset: (assetInfo: AssetInfo) => Promise<boolean>;
  updateImportedClips?: (
    importedClips: KshanaTimelineState['imported_clips'],
  ) => void;
}

export interface OpenReelProjectAdapter {
  describeCapabilities: () => string;
  importMedia: (params: {
    projectDirectory: string;
    sourcePath: string;
    forceType?: ImportedMediaData['type'];
  }) => Promise<ImportedMediaData>;
  replaceMediaAsset: (params: {
    projectDirectory: string;
    currentRelativePath: string;
    sourcePath: string;
  }) => Promise<{
    relativePath: string;
    absolutePath: string;
    thumbnailRelativePath?: string;
    waveformRelativePath?: string;
    extractedAudioRelativePath?: string;
    metadata: ImportedMediaData['metadata'];
  }>;
  addTrack: (params: {
    type: TimelineTrack['type'];
    name?: string;
    isMain?: boolean;
  }) => string;
  createTextClip: (params: {
    content: string;
    startTimeSeconds: number;
    durationSeconds: number;
    trackId?: string;
  }) => string;
  createStickerClip: (params: {
    stickerId: string;
    startTimeSeconds: number;
    durationSeconds: number;
    trackId?: string;
  }) => string;
  updateTextStyle: (
    elementId: string,
    style: Partial<
      Pick<
        TimelineTextElement,
        | 'font_size'
        | 'font_family'
        | 'color'
        | 'background_color'
        | 'text_align'
        | 'font_weight'
        | 'font_style'
        | 'text_decoration'
        | 'letter_spacing'
        | 'line_height'
      >
    >,
  ) => boolean;
  updateTextTransform: (
    elementId: string,
    transform: Partial<TimelineTransform>,
  ) => boolean;
  addMarker: (params: {
    positionSeconds: number;
    prompt: string;
    status?: TimelineMarker['status'];
  }) => string;
  updateMarker: (
    markerId: string,
    patch: Partial<Omit<TimelineMarker, 'id'>>,
  ) => boolean;
  removeMarker: (markerId: string) => boolean;
  setKeyframes: (
    elementId: string,
    keyframes: TimelineKeyframeProperty[],
  ) => boolean;
  upsertKeyframePoint: (params: {
    elementId: string;
    property: string;
    timeSeconds: number;
    value: number | string | boolean;
    easing?: string;
  }) => boolean;
  removeKeyframePoint: (params: {
    elementId: string;
    property: string;
    timeSeconds: number;
  }) => boolean;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneTrack(track: TimelineTrack): TimelineTrack {
  return {
    ...track,
    elements: [...track.elements],
  };
}

function getDefaultTrackName(type: TimelineTrack['type']): string {
  switch (type) {
    case 'audio':
      return 'Audio Track';
    case 'text':
      return 'Text Track';
    case 'sticker':
      return 'Sticker Track';
    case 'graphics':
      return 'Graphics Track';
    default:
      return 'Video Track';
  }
}

function getOrCreateTrack(
  state: KshanaTimelineState,
  updateTimelineTracks: (tracks: TimelineTrack[]) => void,
  params: {
    type: TimelineTrack['type'];
    name?: string;
    isMain?: boolean;
    trackId?: string;
  },
): TimelineTrack {
  const existing = state.tracks.find((track) => {
    if (params.trackId) {
      return track.id === params.trackId;
    }

    if (track.type !== params.type) {
      return false;
    }

    if (params.isMain === undefined) {
      return true;
    }

    return Boolean(track.is_main) === Boolean(params.isMain);
  });

  if (existing) {
    return existing;
  }

  const created: TimelineTrack = {
    id: createId('track'),
    name: params.name ?? getDefaultTrackName(params.type),
    type: params.type,
    is_main: params.isMain,
    muted: false,
    hidden: false,
    elements: [],
  };

  updateTimelineTracks([...state.tracks, created]);
  return created;
}

function patchElementInTracks(
  tracks: TimelineTrack[],
  elementId: string,
  patcher: (element: TimelineTrackElement) => TimelineTrackElement,
): {
  tracks: TimelineTrack[];
  changed: boolean;
} {
  let changed = false;

  const nextTracks = tracks.map((track) => {
    let trackChanged = false;

    const nextElements = track.elements.map((element) => {
      if (element.id !== elementId) {
        return element;
      }

      trackChanged = true;
      changed = true;
      return patcher(element);
    });

    if (!trackChanged) {
      return track;
    }

    return {
      ...track,
      elements: nextElements,
    };
  });

  return {
    tracks: nextTracks,
    changed,
  };
}

function patchMetadata(
  metadata: TimelineElementMetadata | undefined,
  patch: Partial<TimelineElementMetadata>,
): TimelineElementMetadata {
  return {
    ...(metadata ?? {}),
    ...patch,
  };
}

export function createOpenReelProjectAdapter(
  deps: OpenReelProjectAdapterDeps,
): OpenReelProjectAdapter {
  const describeCapabilities = (): string => {
    return [
      'import/replace media',
      'tracks',
      'text/sticker clips',
      'markers',
      'keyframes',
    ].join(', ');
  };

  const importMedia: OpenReelProjectAdapter['importMedia'] = async (params) => {
    const imported = await importMediaToProject(params);
    await deps.addAsset(importedMediaToAssetInfo(imported));

    const current = deps.getTimelineState();
    const next = appendImportedMediaToTimelineState(current, imported);
    deps.updateTimelineTracks(next.tracks);
    deps.updateImportedClips?.(next.imported_clips);

    return imported;
  };

  const replaceMediaAsset: OpenReelProjectAdapter['replaceMediaAsset'] = async (
    params,
  ) => {
    const replaced = await replaceMediaInProject(params);
    const current = deps.getTimelineState();

    const nextTracks = current.tracks.map((track) => {
      const nextTrack = cloneTrack(track);
      nextTrack.elements = nextTrack.elements.map((element) => {
        if (
          (element.type === 'video' ||
            element.type === 'image' ||
            element.type === 'audio') &&
          element.source_path === params.currentRelativePath
        ) {
          return {
            ...element,
            source_path: replaced.relativePath,
          };
        }
        return element;
      });
      return nextTrack;
    });

    deps.updateTimelineTracks(nextTracks);
    return replaced;
  };

  const addTrack: OpenReelProjectAdapter['addTrack'] = (params) => {
    const current = deps.getTimelineState();
    const track = getOrCreateTrack(current, deps.updateTimelineTracks, {
      type: params.type,
      name: params.name,
      isMain: params.isMain,
    });

    return track.id;
  };

  const createTextClip: OpenReelProjectAdapter['createTextClip'] = (params) => {
    const initialState = deps.getTimelineState();
    const track = getOrCreateTrack(initialState, deps.updateTimelineTracks, {
      type: 'text',
      name: 'Text Track',
      trackId: params.trackId,
    });
    const current = deps.getTimelineState();

    const textId = createId('text');
    const textElement: TimelineTextElement = {
      id: textId,
      type: 'text',
      name: 'Text',
      content: params.content,
      duration_seconds: params.durationSeconds,
      start_time_seconds: params.startTimeSeconds,
      trim: { in_seconds: 0, out_seconds: 0 },
      transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
      opacity: 1,
      blend_mode: 'normal',
      font_size: 42,
      font_family: 'Arial',
      color: '#FFFFFF',
      background_color: 'transparent',
      text_align: 'center',
      font_weight: '700',
      font_style: 'normal',
      text_decoration: 'none',
      letter_spacing: 0,
      line_height: 1.2,
      metadata: {
        sourceRef: 'openreel.text',
      },
    };

    const nextTracks = current.tracks.map((candidate) => {
      if (candidate.id !== track.id) {
        return candidate;
      }

      return {
        ...candidate,
        elements: [...candidate.elements, textElement],
      };
    });

    deps.updateTimelineTracks(nextTracks);
    return textId;
  };

  const createStickerClip: OpenReelProjectAdapter['createStickerClip'] = (
    params,
  ) => {
    const initialState = deps.getTimelineState();
    const track = getOrCreateTrack(initialState, deps.updateTimelineTracks, {
      type: 'sticker',
      name: 'Sticker Track',
      trackId: params.trackId,
    });
    const current = deps.getTimelineState();

    const stickerId = createId('sticker');

    const nextTracks = current.tracks.map((candidate) => {
      if (candidate.id !== track.id) {
        return candidate;
      }

      return {
        ...candidate,
        elements: [
          ...candidate.elements,
          {
            id: stickerId,
            type: 'sticker',
            name: 'Sticker',
            duration_seconds: params.durationSeconds,
            start_time_seconds: params.startTimeSeconds,
            trim: { in_seconds: 0, out_seconds: 0 },
            transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
            opacity: 1,
            blend_mode: 'normal',
            sticker_id: params.stickerId,
            metadata: {
              sourceRef: 'openreel.sticker',
            },
          },
        ],
      };
    });

    deps.updateTimelineTracks(nextTracks);
    return stickerId;
  };

  const updateTextStyle: OpenReelProjectAdapter['updateTextStyle'] = (
    elementId,
    style,
  ) => {
    const current = deps.getTimelineState();

    const { tracks: nextTracks, changed } = patchElementInTracks(
      current.tracks,
      elementId,
      (element) => {
        if (element.type !== 'text') {
          return element;
        }

        return {
          ...element,
          ...style,
        };
      },
    );

    if (changed) {
      deps.updateTimelineTracks(nextTracks);
    }

    return changed;
  };

  const updateTextTransform: OpenReelProjectAdapter['updateTextTransform'] = (
    elementId,
    transform,
  ) => {
    const current = deps.getTimelineState();

    const { tracks: nextTracks, changed } = patchElementInTracks(
      current.tracks,
      elementId,
      (element) => {
        if (element.type !== 'text') {
          return element;
        }

        return {
          ...element,
          transform: {
            ...element.transform,
            ...transform,
            position: {
              ...element.transform.position,
              ...(transform.position ?? {}),
            },
          },
        };
      },
    );

    if (changed) {
      deps.updateTimelineTracks(nextTracks);
    }

    return changed;
  };

  const addMarker: OpenReelProjectAdapter['addMarker'] = (params) => {
    const current = deps.getTimelineState();
    const markerId = createId('marker');

    deps.updateMarkers([
      ...current.markers,
      {
        id: markerId,
        position_seconds: params.positionSeconds,
        prompt: params.prompt,
        status: params.status ?? 'pending',
        created_at: new Date().toISOString(),
      },
    ]);

    return markerId;
  };

  const updateMarker: OpenReelProjectAdapter['updateMarker'] = (
    markerId,
    patch,
  ) => {
    const current = deps.getTimelineState();
    let changed = false;

    const nextMarkers = current.markers.map((marker) => {
      if (marker.id !== markerId) {
        return marker;
      }

      changed = true;
      return {
        ...marker,
        ...patch,
      };
    });

    if (changed) {
      deps.updateMarkers(nextMarkers);
    }

    return changed;
  };

  const removeMarker: OpenReelProjectAdapter['removeMarker'] = (markerId) => {
    const current = deps.getTimelineState();
    const nextMarkers = current.markers.filter((marker) => marker.id !== markerId);

    if (nextMarkers.length === current.markers.length) {
      return false;
    }

    deps.updateMarkers(nextMarkers);
    return true;
  };

  const setKeyframes: OpenReelProjectAdapter['setKeyframes'] = (
    elementId,
    keyframes,
  ) => {
    const current = deps.getTimelineState();

    const { tracks: nextTracks, changed } = patchElementInTracks(
      current.tracks,
      elementId,
      (element) => ({
        ...element,
        metadata: patchMetadata(element.metadata, { keyframes }),
      }),
    );

    if (changed) {
      deps.updateTimelineTracks(nextTracks);
    }

    return changed;
  };

  const upsertKeyframePoint: OpenReelProjectAdapter['upsertKeyframePoint'] = (
    params,
  ) => {
    const current = deps.getTimelineState();

    const { tracks: nextTracks, changed } = patchElementInTracks(
      current.tracks,
      params.elementId,
      (element) => {
        const metadata = element.metadata ?? {};
        const currentKeyframes = metadata.keyframes ?? [];

        const propertyEntry = currentKeyframes.find(
          (item) => item.property === params.property,
        );

        const nextPropertyEntry: TimelineKeyframeProperty = propertyEntry
          ? {
              ...propertyEntry,
              points: [...propertyEntry.points],
            }
          : {
              property: params.property,
              points: [],
            };

        const existingPointIndex = nextPropertyEntry.points.findIndex(
          (point) => point.time_seconds === params.timeSeconds,
        );

        if (existingPointIndex >= 0) {
          nextPropertyEntry.points[existingPointIndex] = {
            time_seconds: params.timeSeconds,
            value: params.value,
            easing: params.easing,
          };
        } else {
          nextPropertyEntry.points.push({
            time_seconds: params.timeSeconds,
            value: params.value,
            easing: params.easing,
          });
          nextPropertyEntry.points.sort(
            (a, b) => a.time_seconds - b.time_seconds,
          );
        }

        const nextKeyframes = currentKeyframes.filter(
          (item) => item.property !== params.property,
        );
        nextKeyframes.push(nextPropertyEntry);

        return {
          ...element,
          metadata: patchMetadata(metadata, {
            keyframes: nextKeyframes,
          }),
        };
      },
    );

    if (changed) {
      deps.updateTimelineTracks(nextTracks);
    }

    return changed;
  };

  const removeKeyframePoint: OpenReelProjectAdapter['removeKeyframePoint'] = (
    params,
  ) => {
    const current = deps.getTimelineState();

    const { tracks: nextTracks, changed } = patchElementInTracks(
      current.tracks,
      params.elementId,
      (element) => {
        const metadata = element.metadata ?? {};
        const currentKeyframes = metadata.keyframes ?? [];

        const nextKeyframes = currentKeyframes
          .map((entry) => {
            if (entry.property !== params.property) {
              return entry;
            }

            return {
              ...entry,
              points: entry.points.filter(
                (point) => point.time_seconds !== params.timeSeconds,
              ),
            };
          })
          .filter((entry) => entry.points.length > 0);

        return {
          ...element,
          metadata: patchMetadata(metadata, {
            keyframes: nextKeyframes,
          }),
        };
      },
    );

    if (changed) {
      deps.updateTimelineTracks(nextTracks);
    }

    return changed;
  };

  return {
    describeCapabilities,
    importMedia,
    replaceMediaAsset,
    addTrack,
    createTextClip,
    createStickerClip,
    updateTextStyle,
    updateTextTransform,
    addMarker,
    updateMarker,
    removeMarker,
    setKeyframes,
    upsertKeyframePoint,
    removeKeyframePoint,
  };
}
