import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/gia', testMatch: '**/*.spec.ts', workers: 1,
  use: { baseURL: process.env.GIA_TEST_URL || 'http://127.0.0.1:3002', launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } },
  reporter: 'list',
});
