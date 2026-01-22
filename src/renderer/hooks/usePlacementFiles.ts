/**
 * Hook to read and watch placement markdown files
 * Watches for changes to image-placements.md and video-placements.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  parseImagePlacements,
  parseImagePlacementsWithErrors,
  parseVideoPlacements,
  type ParsedImagePlacement,
  type ParsedVideoPlacement,
} from '../utils/placementParsers';

interface PlacementFilesState {
  imagePlacements: ParsedImagePlacement[];
  videoPlacements: ParsedVideoPlacement[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to read and watch placement markdown files
 * Automatically reloads when files change (debounced)
 */
export function usePlacementFiles(): PlacementFilesState {
  const { projectDirectory } = useWorkspace();
  const [state, setState] = useState<PlacementFilesState>({
    imagePlacements: [],
    videoPlacements: [],
    isLoading: true,
    error: null,
  });

  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlacementFiles = useCallback(async () => {
    if (!projectDirectory) {
      setState({
        imagePlacements: [],
        videoPlacements: [],
        isLoading: false,
        error: null,
      });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const imagePlacementsPath = `${projectDirectory}/.kshana/agent/content/image-placements.md`;
      const videoPlacementsPath = `${projectDirectory}/.kshana/agent/content/video-placements.md`;

      // Read both files in parallel
      const [imageContent, videoContent] = await Promise.all([
        window.electron.project.readFile(imagePlacementsPath).catch(() => null),
        window.electron.project.readFile(videoPlacementsPath).catch(() => null),
      ]);

      // Parse placements (empty arrays if files don't exist)
      let imagePlacements: ParsedImagePlacement[] = [];
      let videoPlacements: ParsedVideoPlacement[] = [];
      let parseError: string | null = null;

      if (imageContent) {
        try {
          const parseResult = parseImagePlacementsWithErrors(imageContent, false);
          imagePlacements = parseResult.placements;

          // Log warnings and errors
          if (parseResult.warnings.length > 0) {
            console.warn('[usePlacementFiles] Image placement parser warnings:', parseResult.warnings);
          }
          if (parseResult.errors.length > 0) {
            console.error('[usePlacementFiles] Image placement parser errors:', parseResult.errors);
            parseError = `Found ${parseResult.errors.length} parsing error(s) in image-placements.md. Check console for details.`;
          }
        } catch (error) {
          console.error('[usePlacementFiles] Failed to parse image placements:', error);
          parseError = `Failed to parse image-placements.md: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      if (videoContent) {
        try {
          videoPlacements = parseVideoPlacements(videoContent);
        } catch (error) {
          console.error('[usePlacementFiles] Failed to parse video placements:', error);
          parseError = parseError
            ? `${parseError}; Failed to parse video-placements.md: ${error instanceof Error ? error.message : String(error)}`
            : `Failed to parse video-placements.md: ${error instanceof Error ? error.message : String(error)}`;
        }
      }

      setState({
        imagePlacements,
        videoPlacements,
        isLoading: false,
        error: parseError,
      });
    } catch (error) {
      console.error('[usePlacementFiles] Failed to load placement files:', error);
      setState({
        imagePlacements: [],
        videoPlacements: [],
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load placement files',
      });
    }
  }, [projectDirectory]);

  // Initial load
  useEffect(() => {
    loadPlacementFiles();
  }, [loadPlacementFiles]);

  // Watch for file changes
  useEffect(() => {
    if (!projectDirectory) return;

    const unsubscribe = window.electron.project.onFileChange((event) => {
      const filePath = event.path;

      // Check if placement files changed
      if (
        filePath.includes('image-placements.md') ||
        filePath.includes('video-placements.md')
      ) {
        // Clear existing timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }

        // Debounce rapid file changes (300ms)
        debounceTimeoutRef.current = setTimeout(() => {
          loadPlacementFiles();
        }, 300);
      }
    });

    return () => {
      unsubscribe();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [projectDirectory, loadPlacementFiles]);

  return state;
}
