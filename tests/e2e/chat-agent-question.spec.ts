/**
 * Wave 5 — Agent-asks-user question flow.
 *
 * **COMPONENT GAP:** `agent_question` is handled in the legacy
 * WebSocket-backed `ChatPanel` (src/renderer/components/chat/ChatPanel),
 * which renders `QuestionPrompt` with option buttons and wires
 * `sendResponse` on click. However, neither the `chat` nor the
 * `workspace` test surface currently mounts that component — both
 * render `ChatPanelEmbedded`, which does not handle `agent_question`
 * events at all (no `agent_question` case in handleEvent).
 *
 * All cases stay as test.fixme until either:
 *   (a) `ChatPanelEmbedded` gains `agent_question` support, or
 *   (b) a test surface that mounts the full `ChatPanel` is wired up.
 */
import { test } from './fixtures';

test.describe('Feature: Agent question prompt', () => {
  test.describe('Given a scenario emits agent_question with options after runTask', () => {
    test.fixme(
      'When the question renders, Then the question text and each option button are visible',
      async () => {
        // ChatPanelEmbedded.handleEvent has no agent_question case.
        // Full ChatPanel (which has QuestionPrompt) is not mounted in tests.
      },
    );

    test.fixme(
      'When the user clicks an option, Then sendResponse is called with that option text',
      async () => {
        // Same gap — QuestionPrompt / sendResponse path unreachable
        // from any current test surface.
      },
    );

    test.fixme(
      'When the question has a defaultOption and a timeout fires, Then sendResponse is called with the default',
      async () => {
        // Same gap. Also requires ChatPanel's auto-timeout logic
        // (cancelActiveQuestionTimer / effectiveAutoApproveTimeoutMs).
      },
    );
  });
});
