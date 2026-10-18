import { defineConfig } from '@playwright/test';

const port = process.env.UI_PORT || '47123';

export default defineConfig({
  testDir: 'tests/ui',
  outputDir: process.env.UI_OUTPUT || 'test-results',
  snapshotPathTemplate: '{testDir}/screenshots/{platform}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: `${process.env.UI_OUTPUT || 'test-results'}/report` }]] : 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: { baseURL: `http://127.0.0.1:${port}`, colorScheme: 'light', locale: 'en-US', timezoneId: 'UTC' },
  webServer: {
    command: 'node tests/ui/serve.mjs',
    env: { UI_PORT: port },
    url: `http://127.0.0.1:${port}/api/session`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
