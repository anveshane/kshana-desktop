import {
  createEmptyImageProjectionSnapshot,
  type ImageProjectionSnapshot,
} from './types';

type SnapshotListener = (snapshot: ImageProjectionSnapshot) => void;

function arePlacementsEqual(
  left: ImageProjectionSnapshot['placements'],
  right: ImageProjectionSnapshot['placements'],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    if (!(key in right)) return false;
    const leftPlacement = left[Number(key)];
    const rightPlacement = right[Number(key)];
    if (!leftPlacement || !rightPlacement) return false;

    if (
      leftPlacement.placementNumber !== rightPlacement.placementNumber ||
      leftPlacement.status !== rightPlacement.status ||
      leftPlacement.assetId !== rightPlacement.assetId ||
      leftPlacement.path !== rightPlacement.path ||
      leftPlacement.version !== rightPlacement.version ||
      leftPlacement.source !== rightPlacement.source
    ) {
      return false;
    }
  }

  return true;
}

function areSnapshotsEqual(
  left: ImageProjectionSnapshot,
  right: ImageProjectionSnapshot,
): boolean {
  if (left.projectDirectory !== right.projectDirectory) return false;
  if (left.unresolvedCount !== right.unresolvedCount) return false;
  if (left.lastConvergedAt !== right.lastConvergedAt) return false;
  if (left.lastTriggerSource !== right.lastTriggerSource) return false;
  return arePlacementsEqual(left.placements, right.placements);
}

export class ImageAssetProjectionStore {
  private snapshot: ImageProjectionSnapshot = createEmptyImageProjectionSnapshot();

  private listeners = new Set<SnapshotListener>();

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): ImageProjectionSnapshot {
    return this.snapshot;
  }

  reset(projectDirectory: string | null): void {
    const nextSnapshot = createEmptyImageProjectionSnapshot(projectDirectory);
    this.snapshot = nextSnapshot;
    this.emit();
  }

  commit(nextSnapshot: ImageProjectionSnapshot): boolean {
    if (areSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return false;
    }

    this.snapshot = nextSnapshot;
    this.emit();
    return true;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
