import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (existsSync('/usr/bin/chromium')) return '/usr/bin/chromium';
  if (existsSync('/usr/bin/google-chrome-stable')) return '/usr/bin/google-chrome-stable';
  if (existsSync('/usr/local/bin/google-chrome-stable')) return '/usr/local/bin/google-chrome-stable';
  if (existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome';
  if (existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome';
  return undefined;
}

const executablePath = chromiumPath();

export default defineConfig({
  testDir: './tests/gia', testMatch: '**/*.spec.ts', workers: 1,
  use: {
    baseURL: process.env.GIA_TEST_URL || 'http://127.0.0.1:3002',
    launchOptions: { ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] },
  },
  reporter: 'list',
});
