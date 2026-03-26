import { describe, expect, test } from '@jest/globals';

import {
  backendAssetManifestToDesktop,
  backendProjectToDesktopAgentState,
} from './backendProjectAdapter';

describe('backendProjectAdapter', () => {
  test('ignores shot-specific assets when resolving scene card image paths', () => {
    const project = {
      version: '2.0' as const,
      id: 'proj-1',
      title: 'Test Project',
      originalInputFile: 'original_input.md',
      style: 'cinematic_realism',
      inputType: 'idea' as const,
      createdAt: 1,
      updatedAt: 2,
      currentPhase: 'scene_images',
      phases: {},
      content: {
        plot: { status: 'missing' as const },
        story: { status: 'missing' as const },
        characters: { status: 'missing' as const },
        settings: { status: 'missing' as const },
        scenes: { status: 'missing' as const },
        images: { status: 'partial' as const },
        videos: { status: 'missing' as const },
      },
      characters: [],
      settings: [],
      scenes: [
        {
          sceneNumber: 1,
          title: 'Scene 1',
          contentApprovalStatus: 'pending' as const,
          imageApprovalStatus: 'pending' as const,
          videoApprovalStatus: 'pending' as const,
          regenerationCount: 0,
        },
      ],
      assets: [],
    };

    const assets = backendAssetManifestToDesktop({
      assets: [
        {
          id: 'img_scene_1_shot_1',
          type: 'scene_image',
          path: 'assets/images/scene-1-shot-1.png',
          scene_number: 1,
          metadata: {
            placementNumber: 1,
            shot_number: 1,
          },
        },
        {
          id: 'img_scene_1_cover',
          type: 'scene_image',
          path: 'assets/images/scene-1-cover.png',
          scene_number: 1,
          metadata: {
            placementNumber: 1,
          },
        },
      ],
    });

    const adapted = backendProjectToDesktopAgentState(project, assets);

    expect(adapted.scenes[0]?.image_path).toBe('assets/images/scene-1-cover.png');
  });
});
