import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [['list']],
  projects: [
    { name: 'unit', testDir: './test/unit' },
    {
      name: 'smoke',
      testDir: './test/smoke',
      timeout: 5 * 60_000,
      workers: 1,
      use: { baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost' }
    }
  ]
})
