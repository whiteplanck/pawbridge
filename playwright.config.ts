import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:1420', viewport: { width: 420, height: 900 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run dev', url: 'http://127.0.0.1:1420', reuseExistingServer: false },
    { command: 'node server/index.mjs', url: 'http://127.0.0.1:8788/health', env: { PORT: '8788', DATABASE_PATH: './test-results/ui.sqlite' }, reuseExistingServer: false },
  ],
});
