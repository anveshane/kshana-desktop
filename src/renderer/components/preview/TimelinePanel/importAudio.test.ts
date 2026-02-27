import { describe, expect, it, jest } from '@jest/globals';
import { importAudioFromFileToProject } from './importAudio';

describe('importAudioFromFileToProject', () => {
  it('copies selected audio and refreshes timeline audio files', async () => {
    const callOrder: string[] = [];

    const projectBridge = {
      selectAudioFile: jest.fn(async () => {
        callOrder.push('select');
        return '/tmp/voice.mp3';
      }),
      createFolder: jest.fn(async (basePath: string, relativePath: string) => {
        callOrder.push(`mkdir:${basePath}:${relativePath}`);
        return `${basePath}/${relativePath}`;
      }),
      copy: jest.fn(async () => {
        callOrder.push('copy');
        return '/project/.kshana/agent/audio/voice.mp3';
      }),
    };

    const refreshAudioFiles = jest.fn(async () => {
      callOrder.push('refresh');
    });

    const imported = await importAudioFromFileToProject({
      projectDirectory: '/project',
      projectBridge,
      refreshAudioFiles,
    });

    expect(imported).toBe(true);
    expect(projectBridge.createFolder).toHaveBeenCalledTimes(3);
    expect(projectBridge.copy).toHaveBeenCalledWith(
      '/tmp/voice.mp3',
      '/project/.kshana/agent/audio',
    );
    expect(refreshAudioFiles).toHaveBeenCalledTimes(1);
    expect(callOrder.indexOf('copy')).toBeLessThan(
      callOrder.indexOf('refresh'),
    );
  });

  it('returns false when the user does not select an audio file', async () => {
    const projectBridge = {
      selectAudioFile: jest.fn(async () => null),
      createFolder: jest.fn(async () => null),
      copy: jest.fn(async () => ''),
    };
    const refreshAudioFiles = jest.fn(async () => {});

    const imported = await importAudioFromFileToProject({
      projectDirectory: '/project',
      projectBridge,
      refreshAudioFiles,
    });

    expect(imported).toBe(false);
    expect(projectBridge.createFolder).not.toHaveBeenCalled();
    expect(projectBridge.copy).not.toHaveBeenCalled();
    expect(refreshAudioFiles).not.toHaveBeenCalled();
  });
});
