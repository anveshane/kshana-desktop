/**
 * Mock Project Structure Generator
 * Generates the complete directory structure with files for mock data
 */

import { MOCK_CHARACTERS } from './mockCharacters';
import { generateAllCharacterMarkdowns } from './mockCharacters';
import { MOCK_SETTINGS } from './mockSettings';
import { generateAllSettingMarkdowns } from './mockSettings';
import { MOCK_PROPS } from './mockProps';
import { generateAllPropMarkdowns } from './mockProps';
import { MOCK_SCENES } from './mockScenes';
import { generateAllSceneMarkdowns } from './mockScenes';
import {
  generatePlotMarkdown,
  generateStoryMarkdown,
  generateScenesMarkdown,
  generateFullScriptMarkdown,
} from './mockPlans';
import {
  getTestImageForCharacter,
  getTestImageForSetting,
  getTestImageForScene,
  getTestVideoForScene,
  resolveTestAssetPath,
} from './testAssetMapping';
import { resolveTestAssetPathToAbsolute } from '../../../utils/pathResolver';
import { getSceneVideoVersions } from './mockAssets';
import { createMockAssetManifest } from './mockAssets';
import { copyVideoToScene, setActiveVideoVersion } from '../../../utils/videoWorkspace';

/**
 * Generates the complete mock project structure
 * Creates directories and files for characters, settings, props, and plans
 * 
 * @param projectDirectory - The root project directory path
 */
export async function generateMockProjectStructure(
  projectDirectory: string,
): Promise<void> {
  const agentPath = `${projectDirectory}/.kshana/agent`;
  const charactersPath = `${agentPath}/characters`;
  const settingsPath = `${agentPath}/settings`;
  const propsPath = `${agentPath}/props`;
  const scenesPath = `${agentPath}/scenes`;
  const plansPath = `${agentPath}/plans`;

  try {
    // Create base directories
    await window.electron.project.createFolder(projectDirectory, '.kshana/agent');
    await window.electron.project.createFolder(agentPath, 'characters');
    await window.electron.project.createFolder(agentPath, 'settings');
    await window.electron.project.createFolder(agentPath, 'props');
    await window.electron.project.createFolder(agentPath, 'scenes');
    await window.electron.project.createFolder(agentPath, 'plans');

    // Generate character files
    await generateCharacterFiles(charactersPath);

    // Generate setting files
    await generateSettingFiles(settingsPath);

    // Generate prop files
    await generatePropFiles(propsPath);

    // Generate scene files
    await generateSceneFiles(scenesPath, projectDirectory);

    // Generate plan files
    await generatePlanFiles(plansPath);
  } catch (error) {
    console.error('Error generating mock project structure:', error);
    // Don't throw - allow partial generation
  }
}

/**
 * Generates character directory structure and files
 */
async function generateCharacterFiles(charactersPath: string): Promise<void> {
  const characterMarkdowns = generateAllCharacterMarkdowns();

  for (const character of MOCK_CHARACTERS) {
    const characterDir = `${charactersPath}/${character.slug}`;
    
    try {
      // Create character directory
      await window.electron.project.createFolder(charactersPath, character.slug);

      // Write character.md
      const markdown = characterMarkdowns[character.slug];
      if (markdown) {
        await window.electron.project.writeFile(
          `${characterDir}/character.md`,
          markdown,
        );
      }

      // Copy image if available
      const testImage = getTestImageForCharacter(character.slug);
      if (testImage) {
        try {
          const sourcePath = await resolveTestAssetPathToAbsolute(
            resolveTestAssetPath('image', testImage),
          );
          // Copy the image file
          const copiedFilePath = await window.electron.project.copy(
            sourcePath,
            characterDir,
          );
          // Rename copied file to image.png
          const copiedFileName = copiedFilePath.split('/').pop() || testImage;
          const copiedFileFullPath = `${characterDir}/${copiedFileName}`;
          if (copiedFileName !== 'image.png') {
            await window.electron.project.rename(copiedFileFullPath, 'image.png');
          }
        } catch (imageError) {
          console.warn(
            `Failed to copy image for character ${character.slug}:`,
            imageError,
          );
        }
      }
    } catch (error) {
      console.warn(`Failed to generate files for character ${character.slug}:`, error);
      // Continue with next character
    }
  }
}

/**
 * Generates setting directory structure and files
 */
async function generateSettingFiles(settingsPath: string): Promise<void> {
  const settingMarkdowns = generateAllSettingMarkdowns();

  for (const setting of MOCK_SETTINGS) {
    const settingDir = `${settingsPath}/${setting.slug}`;
    
    try {
      // Create setting directory
      await window.electron.project.createFolder(settingsPath, setting.slug);

      // Write setting.md
      const markdown = settingMarkdowns[setting.slug];
      if (markdown) {
        await window.electron.project.writeFile(
          `${settingDir}/setting.md`,
          markdown,
        );
      }

      // Copy image if available
      const testImage = getTestImageForSetting(setting.slug);
      if (testImage) {
        try {
          const sourcePath = await resolveTestAssetPathToAbsolute(
            resolveTestAssetPath('image', testImage),
          );
          // Copy the image file
          const copiedFilePath = await window.electron.project.copy(
            sourcePath,
            settingDir,
          );
          // Rename copied file to image.png
          const copiedFileName = copiedFilePath.split('/').pop() || testImage;
          const copiedFileFullPath = `${settingDir}/${copiedFileName}`;
          if (copiedFileName !== 'image.png') {
            await window.electron.project.rename(copiedFileFullPath, 'image.png');
          }
        } catch (imageError) {
          console.warn(
            `Failed to copy image for setting ${setting.slug}:`,
            imageError,
          );
        }
      }
    } catch (error) {
      console.warn(`Failed to generate files for setting ${setting.slug}:`, error);
      // Continue with next setting
    }
  }
}

/**
 * Generates prop directory structure and files
 */
async function generatePropFiles(propsPath: string): Promise<void> {
  const propMarkdowns = generateAllPropMarkdowns();

  for (const prop of MOCK_PROPS) {
    const propDir = `${propsPath}/${prop.slug}`;
    
    try {
      // Create prop directory
      await window.electron.project.createFolder(propsPath, prop.slug);

      // Write prop.md
      const markdown = propMarkdowns[prop.slug];
      if (markdown) {
        await window.electron.project.writeFile(
          `${propDir}/prop.md`,
          markdown,
        );
      }

      // Props don't have test images mapped, so we skip image copying for now
      // Images can be added later if needed
    } catch (error) {
      console.warn(`Failed to generate files for prop ${prop.slug}:`, error);
      // Continue with next prop
    }
  }
}

/**
 * Generates scene directory structure and files
 */
async function generateSceneFiles(
  scenesPath: string,
  projectDirectory: string,
): Promise<void> {
  const sceneMarkdowns = generateAllSceneMarkdowns();

  for (const scene of MOCK_SCENES) {
    const sceneDir = `${scenesPath}/${scene.folder}`;
    
    try {
      // Create scene directory
      await window.electron.project.createFolder(scenesPath, scene.folder);

      // Write scene.md
      const markdown = sceneMarkdowns[scene.folder];
      if (markdown) {
        await window.electron.project.writeFile(
          `${sceneDir}/scene.md`,
          markdown,
        );
      }

      // Copy image if available
      const testImage = getTestImageForScene(scene.folder);
      if (testImage) {
        try {
          const sourcePath = await resolveTestAssetPathToAbsolute(
            resolveTestAssetPath('image', testImage),
          );
          // Copy the image file
          const copiedFilePath = await window.electron.project.copy(
            sourcePath,
            sceneDir,
          );
          // Rename copied file to image.png
          const copiedFileName = copiedFilePath.split('/').pop() || testImage;
          const copiedFileFullPath = `${sceneDir}/${copiedFileName}`;
          if (copiedFileName !== 'image.png') {
            await window.electron.project.rename(copiedFileFullPath, 'image.png');
          }
        } catch (imageError) {
          console.warn(
            `Failed to copy image for scene ${scene.folder}:`,
            imageError,
          );
        }
      }

      // Copy videos if available (similar to images)
      // Get all video versions for this scene from the asset manifest
      const assetManifest = createMockAssetManifest();
      const videoVersions = getSceneVideoVersions(
        assetManifest,
        scene.scene_number,
      );

      if (videoVersions.length > 0) {
        // Determine active version from scene data
        let activeVersion = 1;
        if (scene.video_artifact_id) {
          const versionMatch = scene.video_artifact_id.match(/v(\d+)$/);
          if (versionMatch) {
            activeVersion = parseInt(versionMatch[1], 10);
          }
        }

        // Copy each video version
        for (const videoAsset of videoVersions) {
          try {
            const version = videoAsset.version || 1;
            const testVideo = getTestVideoForScene(scene.scene_number, version);
            
            if (testVideo) {
              const sourcePath = await resolveTestAssetPathToAbsolute(
                resolveTestAssetPath('video', testVideo),
              );
              
              // Use videoWorkspace utility to copy video to scene folder
              await copyVideoToScene(
                sourcePath,
                projectDirectory,
                scene.folder,
                version,
                {
                  artifact_id: videoAsset.id,
                  duration: (videoAsset.metadata?.duration as number) || 5,
                  prompt: (videoAsset.metadata?.prompt as string) || '',
                  seed: (videoAsset.metadata?.seed as number) || undefined,
                  created_at: new Date().toISOString(),
                },
              );
            }
          } catch (videoError) {
            console.warn(
              `Failed to copy video v${videoAsset.version} for scene ${scene.folder}:`,
              videoError,
            );
          }
        }

        // Set active version in current.txt
        try {
          await setActiveVideoVersion(
            projectDirectory,
            scene.folder,
            activeVersion,
          );
        } catch (currentError) {
          console.warn(
            `Failed to set active video version for scene ${scene.folder}:`,
            currentError,
          );
        }
      }
    } catch (error) {
      console.warn(`Failed to generate files for scene ${scene.folder}:`, error);
      // Continue with next scene
    }
  }
}

/**
 * Generates plan files
 */
async function generatePlanFiles(plansPath: string): Promise<void> {
  try {
    // Write plot.md
    await window.electron.project.writeFile(
      `${plansPath}/plot.md`,
      generatePlotMarkdown(),
    );

    // Write story.md
    await window.electron.project.writeFile(
      `${plansPath}/story.md`,
      generateStoryMarkdown(),
    );

    // Write scenes.md
    await window.electron.project.writeFile(
      `${plansPath}/scenes.md`,
      generateScenesMarkdown(),
    );

    // Write full_script.md
    await window.electron.project.writeFile(
      `${plansPath}/full_script.md`,
      generateFullScriptMarkdown(),
    );
  } catch (error) {
    console.warn('Failed to generate plan files:', error);
    // Continue - partial generation is okay
  }
}

