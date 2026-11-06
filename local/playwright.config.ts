import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 60000, workers: 1, fullyParallel: false,
  use: { browserName: 'chromium', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', trace: 'retain-on-failure' },
});
