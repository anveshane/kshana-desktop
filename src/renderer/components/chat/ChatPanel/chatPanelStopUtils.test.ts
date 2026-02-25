import { describe, expect, it } from '@jest/globals';
import {
  failExecutingToolCalls,
  isCancelAckStatus,
  type ActiveToolCallEntry,
} from './chatPanelStopUtils';
import type { ChatMessage } from '../../../types/chat';

describe('chatPanelStopUtils', () => {
  it('detects cancellation acknowledgements from status payloads', () => {
    expect(isCancelAckStatus('ready', 'Task cancelled')).toBe(true);
    expect(isCancelAckStatus('ready', 'Waiting for input...')).toBe(false);
    expect(isCancelAckStatus('error', 'Task cancelled')).toBe(false);
  });

  it('marks active and executing tool calls as failed', () => {
    const now = 1_700_000_000_000;
    const messages: ChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        type: 'agent_text',
        content: 'Thinking...',
        timestamp: now - 1_000,
      },
      {
        id: 'b',
        role: 'system',
        type: 'tool_call',
        content: '',
        timestamp: now - 900,
        meta: {
          toolName: 'generate_image',
          status: 'executing',
        },
      },
      {
        id: 'c',
        role: 'system',
        type: 'tool_call',
        content: '',
        timestamp: now - 800,
        meta: {
          toolName: 'update_project',
          status: 'completed',
        },
      },
    ];

    const activeEntries: ActiveToolCallEntry[] = [
      {
        messageId: 'b',
        startTime: now - 700,
        toolName: 'generate_image',
      },
    ];

    const updated = failExecutingToolCalls(
      messages,
      activeEntries,
      'Cancelled due to project switch',
      now,
    );

    expect(updated[0]).toEqual(messages[0]);
    expect(updated[1]?.meta?.status).toBe('error');
    expect(updated[1]?.meta?.result).toBe('Cancelled due to project switch');
    expect(updated[1]?.meta?.duration).toBe(700);
    expect(updated[2]).toEqual(messages[2]);
  });
});
