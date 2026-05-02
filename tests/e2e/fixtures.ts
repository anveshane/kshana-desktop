import { test as base, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCENARIO_DIR = path.join(__dirname, 'scenarios');

export interface Scenario {
  project?: { name: string; directory?: string };
  rules: Array<{
    on: { channel: string; match?: string };
    emit: Array<{ after?: number; event: string; data: unknown }>;
  }>;
}

export function loadScenarioFromDisk(name: string): Scenario {
  const file = path.join(SCENARIO_DIR, name);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Scenario;
}

export interface BridgeFixtures {
  /**
   * Boots the renderer with the given scenario seeded BEFORE React mounts,
   * so the test bridge picks it up immediately on install. The page is
   * navigated to baseURL and waits until the chat input is visible.
   */
  bootWithScenario(scenarioFile: string): Promise<void>;
}

export const test = base.extend<BridgeFixtures>({
  bootWithScenario: async ({ page }, use) => {
    const boot = async (scenarioFile: string) => {
      const scenario = loadScenarioFromDisk(scenarioFile);
      // Seed the scenario via initScript so it's there before the
      // bundle runs installFakeBridge. installFakeBridge will pick it
      // up and call loadScenario for us.
      await page.addInitScript((s) => {
        (window as unknown as { __pendingScenario?: unknown }).__pendingScenario = s;
      }, scenario);

      await page.goto('/');

      // Apply the pending scenario as soon as __kshanaTest exists.
      await page.waitForFunction(
        () => typeof window.__kshanaTest !== 'undefined',
        { timeout: 10_000 },
      );
      await page.evaluate(() => {
        const pending = (
          window as unknown as { __pendingScenario?: unknown }
        ).__pendingScenario;
        if (pending) {
          (window.__kshanaTest as unknown as {
            loadScenario(s: unknown): void;
          }).loadScenario(pending);
        }
      });

      // Wait for the chat input — once it's visible the project is open
      // and the chat panel is mounted.
      await page.getByPlaceholder(/Type a task and press send/i).waitFor({
        state: 'visible',
        timeout: 15_000,
      });
    };

    await use(boot);
  },
});

export { expect, type Page };
