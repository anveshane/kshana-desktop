/**
 * Wave 3 — ComfyUI URL configuration on the Settings → Connection tab.
 *
 * Note: ComfyUI cloud is a separate concept from kshana-core cloud (which
 * was descoped). These tests pin that ComfyUI URL handling still works.
 */
import { test } from './fixtures';

test.describe('Feature: ComfyUI URL configuration', () => {
  test.describe('Given the Connection tab with no ComfyUI URL set', () => {
    test.fixme(
      'When the user enters a URL and submits, Then settings.update carries comfyuiUrl + comfyuiMode="custom"',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user clears the URL and submits, Then comfyuiMode reverts to "inherit"',
      async () => {
        // Implement.
      },
    );

    test.fixme(
      'When the user fills the Comfy Cloud API key field, Then the value lands in the next settings.update payload',
      async () => {
        // Implement.
      },
    );
  });
});
