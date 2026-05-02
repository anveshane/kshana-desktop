/**
 * Wave 5 — Agent-asks-user question flow.
 *
 * kshana-core fires `agent_question` with options; the chat panel renders
 * the question + option buttons; clicking sends the answer back via
 * `sendResponse`.
 */
import { test } from './fixtures';

test.describe('Feature: Agent question prompt', () => {
  test.describe('Given a scenario emits agent_question with options after runTask', () => {
    test.fixme(
      'When the question renders, Then the question text and each option button are visible',
      async () => {
        // Implement — new scenario file: agent-question.json.
      },
    );

    test.fixme(
      'When the user clicks an option, Then sendResponse is called with that option text',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the question has a defaultOption and a timeout fires, Then sendResponse is called with the default',
      async () => {
        // (?) — verify if the chat panel actually has an auto-default-on-timeout path.
      },
    );
  });
});
