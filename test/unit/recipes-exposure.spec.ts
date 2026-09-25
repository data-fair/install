import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { recipeDir } from '../../scripts/lib/recipes.ts'

// the local recipe has a public mailbox (password reset mails), it must not be reachable from the network
test('the local recipe only publishes ports on the loopback interfaces', () => {
  const dir = recipeDir('local')
  const r = spawnSync('docker', ['compose', '--env-file', '.env.example', '-f', 'compose.yaml', 'config', '--format', 'json'], { cwd: dir, encoding: 'utf8' })
  expect(r.status, r.stderr).toBe(0)
  const published = Object.values(JSON.parse(r.stdout).services as Record<string, any>).flatMap(s => s.ports ?? [])
  expect(published.length).toBeGreaterThan(0)
  for (const port of published) expect(['127.0.0.1', '::1']).toContain(port.host_ip)
})
