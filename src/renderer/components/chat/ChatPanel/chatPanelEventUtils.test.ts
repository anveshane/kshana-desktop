import { describe, expect, it } from '@jest/globals';
import {
  buildCompletedToolMeta,
  findActiveToolCall,
  normalizeQuestionPayload,
  summarizeTodoUpdate,
  withToolAlias,
  type ActiveToolCallEntry,
} from './chatPanelEventUtils';

describe('chatPanelEventUtils', () => {
  it('normalizes question payloads with rich options and auto-approve timeout', () => {
    const normalized = normalizeQuestionPayload({
      question: 'Proceed with write?',
      options: [
        { label: 'Yes', description: 'Continue the write operation' },
        { label: 'No', description: 'Cancel it' },
      ],
      isConfirmation: true,
      autoApproveTimeoutMs: 15000,
    });

    expect(normalized.questionType).toBe('confirm');
    expect(normalized.isConfirmation).toBe(true);
    expect(normalized.autoApproveTimeoutMs).toBe(15000);
    expect(normalized.options[0]).toEqual({
      label: 'Yes',
      description: 'Continue the write operation',
    });
  });

  it('summarizes todo updates with progress and current task', () => {
    const summary = summarizeTodoUpdate([
      { id: '1', task: 'Read project', status: 'completed' },
      { id: '2', task: 'Generate outline', status: 'in_progress' },
      { id: '3', task: 'Render scene', status: 'pending' },
    ]);

    expect(summary).toBe('Task progress 1/3: Generate outline');
  });

  it('matches active tool calls by FIFO when backend tool ids are missing', () => {
    const entries = new Map<string, ActiveToolCallEntry>([
      [
        'read_file-1',
        {
          messageId: 'message-1',
          startTime: 10,
          toolName: 'read_file',
          startedArgs: { path: 'a.md' },
        },
      ],
      [
        'read_file-2',
        {
          messageId: 'message-2',
          startTime: 20,
          toolName: 'read_file',
          startedArgs: { path: 'b.md' },
        },
      ],
    ]);

    const resolved = findActiveToolCall(entries.entries(), {
      toolName: 'read_file',
    });

    expect(resolved?.[0]).toBe('read_file-1');
  });

  it('can re-find active tool calls by real tool id once a stream alias appears', () => {
    const entry = withToolAlias(
      {
        messageId: 'message-1',
        startTime: 10,
        toolName: 'generate_image',
        startedArgs: { prompt: 'hero shot' },
      },
      'tool-123',
    );
    const entries = new Map<string, ActiveToolCallEntry>([['generate-1', entry]]);

    const resolved = findActiveToolCall(entries.entries(), {
      toolCallId: 'tool-123',
    });

    expect(resolved?.[1].messageId).toBe('message-1');
  });

  it('prefers the matching agent when multiple active tools share the same name', () => {
    const entries = new Map<string, ActiveToolCallEntry>([
      [
        'generate_content-1',
        {
          messageId: 'message-1',
          startTime: 10,
          toolName: 'generate_content',
          startedArgs: { content_type: 'plot' },
          agentName: 'Orchestrator',
        },
      ],
      [
        'generate_content-2',
        {
          messageId: 'message-2',
          startTime: 20,
          toolName: 'generate_content',
          startedArgs: { content_type: 'scene' },
          agentName: 'Content Agent',
        },
      ],
    ]);

    const resolved = findActiveToolCall(entries.entries(), {
      toolName: 'generate_content',
      agentName: 'Content Agent',
    });

    expect(resolved?.[1].messageId).toBe('message-2');
  });

  it('builds completed tool metadata using started args when result payload omits them', () => {
    const meta = buildCompletedToolMeta({
      toolName: 'write_file',
      toolCallId: 'tool-1',
      args: {},
      startedArgs: { path: 'plans/outline.md', content: 'Hello' },
      result: { status: 'completed', file_path: 'plans/outline.md' },
      duration: 320,
      status: 'completed',
    });

    expect(meta.args).toEqual({
      path: 'plans/outline.md',
      content: 'Hello',
    });
    expect(meta.mediaPath).toBe('plans/outline.md');
  });
});
