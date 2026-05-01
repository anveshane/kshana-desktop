/**
 * Tests for `ChatPanelEmbedded` — the new chat panel that drives
 * kshana-ink in-process via window.kshana (instead of the legacy
 * WebSocket-backed `ChatPanel.tsx`).
 *
 * Goal: verify the panel
 *   1. renders the chat input + send button
 *   2. submitting a task calls window.kshana.runTask via useKshanaSession
 *   3. tool_call events from the IPC stream appear in the message list
 *   4. agent_response events show as assistant messages
 *   5. media_generated events render inline thumbnails
 *   6. cancel button calls window.kshana.cancelTask
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { KshanaEvent, KshanaEventName } from '../../../../shared/kshanaIpc';
import ChatPanelEmbedded from './ChatPanelEmbedded';

type EventListener = (e: KshanaEvent) => void;
interface KshanaListenerSlot {
  eventName: KshanaEventName | '*';
  cb: EventListener;
  active: boolean;
}

interface KshanaMockState {
  runTaskCalls: Array<{ sessionId: string; task: string }>;
  cancelCalls: Array<{ sessionId: string }>;
  listeners: KshanaListenerSlot[];
  nextSessionId: string;
}

let mockState: KshanaMockState;

function publishEvent(eventName: KshanaEventName, data: unknown): void {
  const event: KshanaEvent = { eventName, sessionId: mockState.nextSessionId, data };
  for (const slot of mockState.listeners) {
    if (!slot.active) continue;
    if (slot.eventName === '*' || slot.eventName === eventName) {
      slot.cb(event);
    }
  }
}

beforeEach(() => {
  mockState = {
    runTaskCalls: [],
    cancelCalls: [],
    listeners: [],
    nextSessionId: 's-1',
  };
  (window as unknown as { kshana: unknown }).kshana = {
    createSession: jest.fn(async () => ({ sessionId: mockState.nextSessionId })),
    configureProject: jest.fn(async () => ({ ok: true })),
    runTask: jest.fn(async (req: { sessionId: string; task: string }) => {
      mockState.runTaskCalls.push(req);
      return { ok: true };
    }),
    cancelTask: jest.fn(async (req: { sessionId: string }) => {
      mockState.cancelCalls.push(req);
      return { cancelled: true };
    }),
    redoNode: jest.fn(async () => ({ ok: true })),
    sendResponse: jest.fn(async () => ({ ok: true })),
    focusProject: jest.fn(async () => ({ ok: true })),
    setAutonomous: jest.fn(async () => ({ ok: true })),
    deleteSession: jest.fn(async () => ({ ok: true })),
    on: jest.fn((eventName: KshanaEventName | '*', cb: EventListener) => {
      const slot = { eventName, cb, active: true };
      mockState.listeners.push(slot);
      return () => {
        slot.active = false;
      };
    }),
  };
});

describe('ChatPanelEmbedded', () => {
  it('renders the chat input + send button', async () => {
    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('submitting a task calls window.kshana.runTask', async () => {
    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    const input = screen.getByRole('textbox') as HTMLInputElement | HTMLTextAreaElement;
    const button = screen.getByRole('button', { name: /send/i });

    fireEvent.change(input, { target: { value: 'create a 30s noir story' } });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(mockState.runTaskCalls).toHaveLength(1);
    expect(mockState.runTaskCalls[0]).toMatchObject({
      sessionId: 's-1',
      task: 'create a 30s noir story',
    });
  });

  it('tool_call events appear in the message list', async () => {
    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    // Wait for the subscription effect to fire after sessionId is set.
    await waitFor(() => {
      expect(mockState.listeners.some((l) => l.active)).toBe(true);
    });

    act(() => {
      publishEvent('tool_call', {
        toolCallId: 'tc-1',
        toolName: 'kshana_run_to',
        arguments: { project: 'noir' },
        status: 'in_progress',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/kshana_run_to/i)).toBeInTheDocument();
    });
  });

  it('agent_response events show as assistant messages', async () => {
    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    // Wait for the subscription effect to fire after sessionId is set.
    await waitFor(() => {
      expect(mockState.listeners.some((l) => l.active)).toBe(true);
    });

    act(() => {
      publishEvent('agent_response', {
        output: 'I created the story.',
        status: 'completed',
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/I created the story/i)).toBeInTheDocument();
    });
  });

  it('media_generated events render inline media thumbnails', async () => {
    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    // Wait for the subscription effect to fire after sessionId is set.
    await waitFor(() => {
      expect(mockState.listeners.some((l) => l.active)).toBe(true);
    });

    act(() => {
      publishEvent('media_generated', {
        kind: 'image',
        project: 'noir',
        path: 'assets/images/s1shot1_first_frame.png',
        source: 'kshana_run_to',
      });
    });

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('alt', expect.stringMatching(/noir|s1shot1/i));
    });
  });

  it('cancel button calls window.kshana.cancelTask while running', async () => {
    // Make runTask hang so the panel stays in 'running' state long
    // enough for the cancel button to render and be clicked.
    let resolveRunTask: ((v: { ok: boolean }) => void) | null = null;
    (window as unknown as { kshana: { runTask: jest.Mock } }).kshana.runTask = jest.fn(
      async (req: { sessionId: string; task: string }) => {
        mockState.runTaskCalls.push(req);
        return new Promise<{ ok: boolean }>((resolve) => {
          resolveRunTask = resolve;
        });
      },
    ) as never;

    render(<ChatPanelEmbedded />);
    await waitFor(() => screen.getByRole('textbox'));
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'long task' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(mockState.cancelCalls).toHaveLength(1);

    // Tidy up the dangling promise so jest doesn't leak it between tests.
    if (resolveRunTask) (resolveRunTask as (v: { ok: boolean }) => void)({ ok: true });
  });
});
