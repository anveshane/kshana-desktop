/**
 * useTimelineData Hook
 * Provides unified timeline data source for VideoLibraryView and TimelinePanel
 * Ensures consistent scene-to-video mapping and timeline item calculation
 */

import { useMemo } from 'react';
import { useProject } from '../contexts/ProjectContext';
import type { Artifact, StoryboardScene } from '../types/projectState';
import type { SceneRef } from '../types/kshana/entities';

export interface TimelineItem {
  id: string;
  type: 'video' | 'scene';
  startTime: number;
  duration: number;
  artifact?: Artifact;
  scene?: StoryboardScene;
  path?: string;
  label: string;
  sceneNumber?: number;
}

export interface TimelineData {
  scenes: StoryboardScene[];
  timelineItems: TimelineItem[];
  artifactsByScene: Record<number, Artifact>;
  videoArtifacts: Artifact[];
  importedVideoArtifacts: Artifact[];
  totalDuration: number;
}

/**
 * Custom hook that provides unified timeline data
 * Single source of truth for timeline calculations
 */
export function useTimelineData(): TimelineData {
  const { isLoaded, scenes: projectScenes, assetManifest } = useProject();

  // Convert SceneRef from ProjectContext to StoryboardScene format
  const scenes: StoryboardScene[] = useMemo(() => {
    if (!isLoaded || projectScenes.length === 0) {
      return [];
    }

    return projectScenes.map((scene) => ({
      scene_number: scene.scene_number,
      name: scene.title,
      description: scene.description || '',
      duration: 5, // Default duration
      shot_type: 'Mid Shot',
      lighting: 'Natural',
    }));
  }, [isLoaded, projectScenes]);

  // Build artifacts map from scenes - prioritize video, fallback to image
  const artifactsByScene: Record<number, Artifact> = useMemo(() => {
    const map: Record<number, Artifact> = {};

    if (!isLoaded || projectScenes.length === 0) return map;

    projectScenes.forEach((scene: SceneRef) => {
      // Check if scene has approved video (highest priority)
      if (scene.video_approval_status === 'approved' && scene.video_path) {
        map[scene.scene_number] = {
          artifact_id:
            scene.video_artifact_id || `scene-${scene.scene_number}-video`,
          artifact_type: 'video',
          scene_number: scene.scene_number,
          file_path: scene.video_path,
          created_at: scene.video_approved_at
            ? new Date(scene.video_approved_at).toISOString()
            : new Date().toISOString(),
        };
      } else if (
        scene.image_approval_status === 'approved' &&
        scene.image_path
      ) {
        // Fallback to image if no video
        map[scene.scene_number] = {
          artifact_id:
            scene.image_artifact_id || `scene-${scene.scene_number}-image`,
          artifact_type: 'image',
          scene_number: scene.scene_number,
          file_path: scene.image_path,
          created_at: scene.image_approved_at
            ? new Date(scene.image_approved_at).toISOString()
            : new Date().toISOString(),
        };
      }
    });

    return map;
  }, [isLoaded, projectScenes]);

  // Build video artifacts from asset manifest
  const videoArtifacts: Artifact[] = useMemo(() => {
    if (!assetManifest?.assets) return [];

    // Filter for video-related asset types
    return assetManifest.assets
      .filter(
        (asset) => asset.type === 'scene_video' || asset.type === 'final_video',
      )
      .map((asset) => ({
        artifact_id: asset.id,
        artifact_type: 'video',
        file_path: asset.path,
        created_at: new Date(asset.created_at).toISOString(),
        scene_number: asset.scene_number,
        metadata: {
          title: asset.path.split('/').pop(),
          duration: asset.metadata?.duration,
          imported: asset.metadata?.imported,
        },
      }));
  }, [assetManifest]);

  // Separate imported videos from scene videos
  const importedVideoArtifacts: Artifact[] = useMemo(() => {
    return videoArtifacts.filter(
      (artifact) => artifact.metadata?.imported === true,
    );
  }, [videoArtifacts]);

  // Calculate scene blocks with timing
  const sceneBlocks = useMemo(() => {
    let currentTime = 0;
    return scenes.map((scene) => {
      const startTime = currentTime;
      const duration = scene.duration || 5;
      currentTime += duration;
      return {
        scene,
        startTime,
        duration,
        artifact: artifactsByScene[scene.scene_number],
      };
    });
  }, [scenes, artifactsByScene]);

  // Create unified timeline items - combine all videos and scenes
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // Add ALL scene blocks from storyboard - every scene appears on timeline
    sceneBlocks.forEach((block) => {
      const sceneLabel =
        block.scene.name || `Scene ${block.scene.scene_number}`;

      if (block.artifact && block.artifact.artifact_type === 'video') {
        // Scene has video - add as video item
        items.push({
          id: `scene-video-${block.scene.scene_number}`,
          type: 'video',
          startTime: block.startTime,
          duration: block.duration,
          artifact: block.artifact,
          scene: block.scene,
          path: block.artifact.file_path,
          label: sceneLabel,
          sceneNumber: block.scene.scene_number,
        });
      } else {
        // Scene without video - add as scene item (will show placeholder or image)
        items.push({
          id: `scene-${block.scene.scene_number}`,
          type: 'scene',
          startTime: block.startTime,
          duration: block.duration,
          scene: block.scene,
          artifact: block.artifact,
          label: sceneLabel,
          sceneNumber: block.scene.scene_number,
        });
      }
    });

    // Calculate scene end time for positioning imported videos
    const sceneEndTime =
      sceneBlocks.length > 0
        ? sceneBlocks[sceneBlocks.length - 1].startTime +
          sceneBlocks[sceneBlocks.length - 1].duration
        : 0;

    // Add imported videos (they go after all scenes)
    let importedVideoTime = sceneEndTime;
    importedVideoArtifacts.forEach((artifact, index) => {
      const duration = (artifact.metadata?.duration as number) || 5;
      items.push({
        id: `imported-${index}`,
        type: 'video',
        startTime: importedVideoTime,
        duration,
        artifact,
        path: artifact.file_path,
        label: 'Imported',
      });
      importedVideoTime += duration;
    });

    // Add other video artifacts that don't have scene numbers and aren't imported
    let orphanVideoTime = importedVideoTime;
    videoArtifacts.forEach((artifact) => {
      if (
        !artifact.scene_number &&
        !artifact.metadata?.imported &&
        !importedVideoArtifacts.includes(artifact)
      ) {
        const duration = (artifact.metadata?.duration as number) || 5;
        items.push({
          id: artifact.artifact_id,
          type: 'video',
          startTime: orphanVideoTime,
          duration,
          artifact,
          path: artifact.file_path,
          label: `VID_${artifact.artifact_id.slice(-6)}`,
        });
        orphanVideoTime += duration;
      }
    });

    // Sort timeline items by startTime to ensure correct order
    items.sort((a, b) => a.startTime - b.startTime);

    return items;
  }, [sceneBlocks, importedVideoArtifacts, videoArtifacts]);

  // Calculate total duration from all timeline items
  const totalDuration = useMemo(() => {
    if (timelineItems.length === 0) return 0;
    const lastItem = timelineItems[timelineItems.length - 1];
    return lastItem.startTime + lastItem.duration;
  }, [timelineItems]);

  return {
    scenes,
    timelineItems,
    artifactsByScene,
    videoArtifacts,
    importedVideoArtifacts,
    totalDuration,
  };
}
