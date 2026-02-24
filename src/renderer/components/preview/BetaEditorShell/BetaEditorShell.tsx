import { useMemo } from 'react';
import { useProject } from '../../../contexts/ProjectContext';
import AssetsView from '../AssetsView/AssetsView';
import {
  createOpenCutEditorAdapter,
  createOpenReelProjectAdapter,
} from '../../../services/adapters';
import '../../../vendor/vendor.css';
import styles from './BetaEditorShell.module.scss';

type Props = {
  onSwitchToLegacy?: () => void;
};

export default function BetaEditorShell({ onSwitchToLegacy }: Props) {
  const {
    timelineState,
    updateTimelineTracks,
    updateTimelineBookmarks,
    updateTimelineViewState,
    updateMarkers,
    updateImportedClips,
    addAsset,
    assetManifest,
    setActiveVersion,
    updateImageTimingOverrides,
    updateInfographicTimingOverrides,
    updateVideoSplitOverrides,
  } = useProject();

  const openCutAdapter = useMemo(
    () =>
      createOpenCutEditorAdapter({
        getTimelineState: () => timelineState,
        updateTimelineTracks,
        updateTimelineBookmarks,
        updateTimelineViewState,
        updateMarkers,
        updateImportedClips,
        updateImageTimingOverrides,
        updateInfographicTimingOverrides,
        updateVideoSplitOverrides,
        setActiveVersion,
      }),
    [
      timelineState,
      updateTimelineTracks,
      updateTimelineBookmarks,
      updateTimelineViewState,
      updateMarkers,
      updateImportedClips,
      updateImageTimingOverrides,
      updateInfographicTimingOverrides,
      updateVideoSplitOverrides,
      setActiveVersion,
    ],
  );

  const openReelAdapter = useMemo(
    () =>
      createOpenReelProjectAdapter({
        getTimelineState: () => timelineState,
        updateTimelineTracks,
        updateMarkers,
        updateImportedClips,
        addAsset,
      }),
    [
      timelineState,
      updateTimelineTracks,
      updateMarkers,
      updateImportedClips,
      addAsset,
    ],
  );

  const adaptedTimelineState = openCutAdapter.getTimelineState();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3>Rich Editor Beta</h3>
          <p>
            Vendored OpenCut/OpenReel shell mounted side-by-side. Legacy panels
            remain available as fallback.
          </p>
        </div>
        {onSwitchToLegacy && (
          <button
            type="button"
            className={styles.legacyButton}
            onClick={onSwitchToLegacy}
          >
            Switch to Legacy
          </button>
        )}
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <h4>OpenReel Assets (Beta)</h4>
            <span>{assetManifest?.assets.length ?? 0} tracked assets</span>
          </header>
          <div className={styles.cardBody}>
            <AssetsView />
          </div>
        </section>

        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <h4>OpenCut Timeline/Inspector Adapter</h4>
            <span>
              {adaptedTimelineState.tracks.length} tracks,{' '}
              {adaptedTimelineState.markers.length} markers
            </span>
          </header>
          <div className={styles.adapterBody}>
            <div className={styles.metric}>
              <strong>Bookmarks</strong>
              <span>{adaptedTimelineState.bookmarks.length}</span>
            </div>
            <div className={styles.metric}>
              <strong>View Zoom</strong>
              <span>{adaptedTimelineState.viewState.zoom_level.toFixed(2)}x</span>
            </div>
            <div className={styles.metric}>
              <strong>OpenReel Adapter</strong>
              <span>{openReelAdapter.describeCapabilities()}</span>
            </div>
            <p className={styles.note}>
              Timeline lanes/keyframes/markers continue rendering in the existing
              timeline panel below while beta adapters route edits through
              Kshana&apos;s canonical schema-v2 state.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
