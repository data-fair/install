import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['list']],
  projects: [
    { name: 'unit', testDir: './test/unit' },
    {
      name: 'smoke-setup',
      testDir: './test/smoke',
      testMatch: /.*\.setup\.ts/,
      use: { baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost' }
    },
    {
      name: 'smoke',
      testDir: './test/smoke',
      dependencies: ['smoke-setup'],
      timeout: 5 * 60_000,
      workers: 1,
      use: { baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost', storageState: 'test-results/.smoke-session.json' }
    }
  ]
})
