import { describe, expect, it } from '@jest/globals';
import type { ChatMessage } from '../../../types/chat';
import {
  findActiveToolCallEntry,
  mergeToolStreamingContent,
  normalizeComparableChatText,
  normalizeTodoUpdatePayload,
  shouldStreamToToolCallCard,
  shouldSuppressAgentResponse,
} from './chatPanelStreamUtils';

describe('chatPanelStreamUtils', () => {
  it('suppresses a final agent response when it duplicates the finalized stream', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        type: 'agent_text',
        content: 'Streaming answer',
        timestamp: 1,
      },
    ];

    expect(
      shouldSuppressAgentResponse({
        output: 'Streaming answer',
        status: 'completed',
        lastFinalizedStreamText: 'Streaming answer',
        messages,
      }),
    ).toBe(true);
  });

  it('suppresses a final agent response when streaming already rendered the same text', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        type: 'agent_text',
        content: 'Streaming answer',
        timestamp: 1,
      },
    ];

    expect(
      shouldSuppressAgentResponse({
        output: 'Streaming answer',
        status: 'completed',
        // Simulate a timing issue where the ref is out of sync.
        lastFinalizedStreamText: '',
        messages,
      }),
    ).toBe(true);
  });

  it('suppresses awaiting-input echoes that mirror the active question', () => {
    const messages: ChatMessage[] = [
      {
        id: 'question-1',
        role: 'assistant',
        type: 'agent_question',
        content: 'Generate Maya reference image?',
        timestamp: 1,
      },
    ];

    expect(
      shouldSuppressAgentResponse({
        output: 'Generate Maya reference image?',
        status: 'awaiting_input',
        lastFinalizedStreamText: '',
        messages,
      }),
    ).toBe(true);
  });

  it('dedupes todo payloads by id first and then by logical content', () => {
    const todos = normalizeTodoUpdatePayload([
      { id: 'phase-1', content: 'Generate scene images', depth: 0, status: 'pending' },
      { id: 'duplicate-id', content: 'Generate scene images', depth: 0, status: 'pending' },
      { id: 'phase-1', content: 'Generate scene images', depth: 0, status: 'completed' },
      { id: 'scene-1', content: 'Generate Scene 1', depth: 1, status: 'completed' },
      { id: 'scene-1-alt', content: 'Generate   Scene 1 ', depth: 1, status: 'in_progress' },
    ]);

    expect(todos).toEqual([
      { id: 'phase-1', content: 'Generate scene images', depth: 0, status: 'completed' },
      { id: 'scene-1-alt', content: 'Generate   Scene 1 ', depth: 1, status: 'in_progress' },
    ]);
  });

  it('finds the active tool stream by tool id or matching tool name', () => {
    const activeToolCalls = new Map([
      [
        'tool-1',
        { messageId: 'message-1', startTime: 1, toolName: 'scan_assets' },
      ],
      [
        'tool-2',
        { messageId: 'message-2', startTime: 2, toolName: 'generate_content' },
      ],
    ]);

    expect(findActiveToolCallEntry(activeToolCalls, 'tool-2', undefined)).toEqual({
      key: 'tool-2',
      entry: { messageId: 'message-2', startTime: 2, toolName: 'generate_content' },
    });
    expect(findActiveToolCallEntry(activeToolCalls, undefined, 'scan_assets')).toEqual({
      key: 'tool-1',
      entry: { messageId: 'message-1', startTime: 1, toolName: 'scan_assets' },
    });
  });

  it('routes media generation stream chunks into the tool card', () => {
    expect(shouldStreamToToolCallCard('generate_image')).toBe(true);
    expect(shouldStreamToToolCallCard('generate_video_from_image')).toBe(true);
    expect(shouldStreamToToolCallCard('generate_video')).toBe(true);
    expect(shouldStreamToToolCallCard('generate_content')).toBe(false);
  });

  it('resets media tool streaming content when the backend requests a reset', () => {
    expect(
      mergeToolStreamingContent('Loading workflow...\nQueued (1 job ahead)', 'Uploading source image...', {
        reset: true,
      }),
    ).toBe('Uploading source image...');
  });

  it('appends media tool streaming chunks when no reset is requested', () => {
    expect(
      mergeToolStreamingContent('Loading workflow...\n', 'Queued (1 job ahead)'),
    ).toBe('Loading workflow...\nQueued (1 job ahead)');
  });

  it('normalizes chat text with cross-platform newlines', () => {
    expect(normalizeComparableChatText('hello\r\nworld\r\n')).toBe('hello\nworld');
  });
});
