import { describe, expect, it } from '@jest/globals';
import type { ChatExportPayload } from '../../shared/chatTypes';
import {
  exportChatJsonWithDialog,
  type ChatExportDependencies,
} from './chatExportService';

describe('chatExportService', () => {
  const payload: ChatExportPayload = {
    exportedAt: '2026-02-25T00:00:00.000Z',
    projectDirectory: '/tmp/project-a',
    sessionId: 'session-a',
    messages: [
      {
        id: '1',
        role: 'user',
        type: 'message',
        content: 'hello',
        timestamp: 1,
      },
    ],
  };

  it('writes exported JSON when save dialog returns a file path', async () => {
    let writeFileCalls = 0;
    let writtenContent = '';
    const writeFile: ChatExportDependencies['writeFile'] = async (
      _filePath,
      content,
    ) => {
      writeFileCalls += 1;
      writtenContent = content;
    };
    const showSaveDialog: ChatExportDependencies['showSaveDialog'] = async () => {
      return {
        canceled: false,
        filePath: '/tmp/export.json',
      };
    };

    const result = await exportChatJsonWithDialog(payload, {
      showSaveDialog,
      writeFile,
    });

    expect(result).toEqual({
      success: true,
      filePath: '/tmp/export.json',
    });
    expect(writeFileCalls).toBe(1);
    expect(JSON.parse(writtenContent)).toEqual(payload);
  });

  it('returns canceled when user closes the save dialog', async () => {
    let writeFileCalls = 0;
    const writeFile: ChatExportDependencies['writeFile'] = async () => {
      writeFileCalls += 1;
    };
    const showSaveDialog: ChatExportDependencies['showSaveDialog'] = async () => {
      return {
        canceled: true,
      };
    };

    const result = await exportChatJsonWithDialog(payload, {
      showSaveDialog,
      writeFile,
    });

    expect(result).toEqual({
      success: false,
      canceled: true,
    });
    expect(writeFileCalls).toBe(0);
  });
});
