/**
 * Wave 3 — LLM provider switching on the Settings → Connection tab.
 */
import { test } from './fixtures';

test.describe('Feature: LLM provider switching', () => {
  test.describe('Given the LLM provider radio defaults to OpenAI-Compatible', () => {
    test.fixme(
      'When the user switches to Gemini, Then Gemini fields (API key, model) become visible and OpenAI fields hide',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user fills Google API key + Gemini model and submits, Then settings.update carries llmProvider="gemini" + those fields',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user switches back to OpenAI after saving Gemini, Then OpenAI fields reappear with their previous values intact',
      async () => {
        // Implement.
      },
    );
  });
});
