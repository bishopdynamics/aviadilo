import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.AVIADILO_CHROMIUM_PATH || undefined,
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1024, height: 1000 },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
});
