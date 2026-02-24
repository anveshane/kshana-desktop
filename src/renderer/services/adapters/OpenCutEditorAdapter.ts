import type {
  KshanaTimelineState,
  SceneVersions,
  TimelineTrack,
} from '../../types/kshana';
import {
  fromOpenCutTimelineState,
  toOpenCutTimelineState,
  type OpenCutLikeTimelineState,
} from '../timeline/OpenCutAdapter';

export interface OpenCutEditorAdapterDeps {
  getTimelineState: () => KshanaTimelineState;
  updateTimelineTracks: (tracks: TimelineTrack[]) => void;
  updateTimelineBookmarks: (
    bookmarks: KshanaTimelineState['bookmarks'],
  ) => void;
  updateTimelineViewState: (
    patch: Partial<KshanaTimelineState['view_state']>,
  ) => void;
  updateMarkers: (markers: KshanaTimelineState['markers']) => void;
  updateImportedClips: (
    importedClips: KshanaTimelineState['imported_clips'],
  ) => void;
  updateImageTimingOverrides: (
    overrides: KshanaTimelineState['image_timing_overrides'],
  ) => void;
  updateInfographicTimingOverrides: (
    overrides: KshanaTimelineState['infographic_timing_overrides'],
  ) => void;
  updateVideoSplitOverrides: (
    overrides: KshanaTimelineState['video_split_overrides'],
  ) => void;
  setActiveVersion?: (
    sceneFolder: string,
    assetType: 'image' | 'video',
    version: number,
  ) => void;
}

export interface OpenCutEditorAdapter {
  getTimelineState: () => OpenCutLikeTimelineState;
  applyTimelineState: (next: OpenCutLikeTimelineState) => void;
  applyTracks: (tracks: OpenCutLikeTimelineState['tracks']) => void;
}

function applyActiveVersions(
  activeVersions: Record<string, SceneVersions | number>,
  setActiveVersion?: OpenCutEditorAdapterDeps['setActiveVersion'],
): void {
  if (!setActiveVersion) {
    return;
  }

  Object.entries(activeVersions).forEach(([sceneFolder, value]) => {
    if (typeof value === 'number') {
      setActiveVersion(sceneFolder, 'video', value);
      return;
    }

    if (typeof value?.image === 'number') {
      setActiveVersion(sceneFolder, 'image', value.image);
    }
    if (typeof value?.video === 'number') {
      setActiveVersion(sceneFolder, 'video', value.video);
    }
  });
}

export function createOpenCutEditorAdapter(
  deps: OpenCutEditorAdapterDeps,
): OpenCutEditorAdapter {
  const getTimelineState = (): OpenCutLikeTimelineState => {
    return toOpenCutTimelineState(deps.getTimelineState());
  };

  const applyTimelineState = (next: OpenCutLikeTimelineState): void => {
    const current = deps.getTimelineState();
    const mapped = fromOpenCutTimelineState(next, current);

    deps.updateTimelineTracks(mapped.tracks);
    deps.updateMarkers(mapped.markers);
    deps.updateImportedClips(mapped.imported_clips);
    deps.updateTimelineBookmarks(mapped.bookmarks);
    deps.updateImageTimingOverrides(mapped.image_timing_overrides);
    deps.updateInfographicTimingOverrides(mapped.infographic_timing_overrides);
    deps.updateVideoSplitOverrides(mapped.video_split_overrides);
    deps.updateTimelineViewState(mapped.view_state);
    applyActiveVersions(mapped.active_versions, deps.setActiveVersion);
  };

  const applyTracks = (tracks: OpenCutLikeTimelineState['tracks']): void => {
    const current = getTimelineState();
    applyTimelineState({
      ...current,
      tracks,
    });
  };

  return {
    getTimelineState,
    applyTimelineState,
    applyTracks,
  };
}
