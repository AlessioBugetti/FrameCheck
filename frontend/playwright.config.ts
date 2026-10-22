import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:8766',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: '.venv/bin/python -m uvicorn framecheck.server:app --host 127.0.0.1 --port 8766 --workers 1',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    url: 'http://127.0.0.1:8766/api/config',
    reuseExistingServer: false,
  },
})
