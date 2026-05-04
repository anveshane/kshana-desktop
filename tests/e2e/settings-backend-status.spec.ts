/**
 * Wave 3 — Backend status display on the Settings → Connection tab.
 *
 * SettingsPanel subscribes to `backend.onStateChange` (channel
 * `'backend:state'` in our fake) and renders a status card. Tests
 * drive the card via `__kshanaTest.emitElectron('backend:state', …)`.
 */
import { test, expect } from './fixtures';

async function openConnectionTab(page: import('./fixtures').Page) {
  await page
    .getByRole('button', { name: /Settings/i, exact: false })
    .first()
    .click();
  await page.getByText(/Local backend configuration/i).click();
  await expect(
    page.getByRole('heading', { name: /Connection/, level: 3 }),
  ).toBeVisible();
}

test.describe('Feature: Backend status display', () => {
  test.describe('Given the Connection tab is visible', () => {
    /**
     * The status listener calls `refreshConnectionInfo()` (which reads
     * `backend.getState()`) right after `setBackendState`. To pin the
     * status we seed `backend.getState` AND emit, so both code paths
     * agree on the new status.
     */
    async function pushBackendState(
      page: import('./fixtures').Page,
      state: { status: string; message?: string; serverUrl?: string },
    ) {
      await page.evaluate((s) => {
        window.__kshanaTest!.setBridgeReturn('backend.getState', s);
        window.__kshanaTest!.emitElectron('backend:state', s);
      }, state);
    }

    test('When backend:state {status: "ready"} fires, Then "Connected to Local" headline renders', async ({
      page,
      bootInline,
    }) => {
      // Given
      await bootInline({ surface: 'landing', rules: [] });
      await openConnectionTab(page);

      // When
      await pushBackendState(page, {
        status: 'ready',
        serverUrl: 'http://127.0.0.1:8001',
      });

      // Then
      await expect(page.getByText('Connected to Local')).toBeVisible();
      await expect(page.getByText(/^Ready$/)).toBeVisible();
    });

    test('When backend:state {status: "error", message: "ENGINE_DOWN"} fires, Then the error message renders', async ({
      page,
      bootInline,
    }) => {
      // Given
      await bootInline({ surface: 'landing', rules: [] });
      await openConnectionTab(page);

      // When
      await pushBackendState(page, {
        status: 'error',
        message: 'ENGINE_DOWN',
      });

      // Then
      await expect(
        page.getByText(/Local backend did not become ready/i),
      ).toBeVisible();
      await expect(page.getByText('ENGINE_DOWN')).toBeVisible();
    });

    test('When backend:state {status: "connecting"} fires, Then "Starting Local backend" headline renders', async ({
      page,
      bootInline,
    }) => {
      // Given
      await bootInline({ surface: 'landing', rules: [] });
      await openConnectionTab(page);

      // When
      await pushBackendState(page, { status: 'connecting' });

      // Then
      await expect(page.getByText('Starting Local backend')).toBeVisible();
    });
  });
});
