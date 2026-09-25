# Data Fair installation docs – implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship runnable Docker Compose recipes (local, production, bonus overlay) for self-hosting the current Data Fair stack. They come with markdown docs, a local end-to-end validation, and a weekly CI drift check.

**Architecture:**
- **Recipes** are plain folders under `recipes/` that users copy.
- **Node 24 TypeScript scripts** under `scripts/` (run directly with native type stripping) orchestrate `docker compose`, run Playwright smoke tests against the running stack, and record validated versions.
- **`scripts/check-versions.ts`** compares recorded versions with published image tags and diffs service config files between tags. A weekly GitHub workflow publishes the result as a single issue.

**Tech Stack:** Node 24 (ESM, `.ts` run directly), `@playwright/test` (unit + smoke projects), neostandard eslint, typescript (`tsc --noEmit` only), Docker Compose v2, nginx, `jonasal/nginx-certbot`, maildev, lychee (via docker), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-install-docs-design.md`

## Global Constraints

- Docs are in English, markdown read on github.com; no static site generator.
- Docker Compose only; no Kubernetes content.
- Configuration reference: link to each service's config schema in its own repo; never duplicate it.
- Node 24, `"type": "module"`, `.ts` files executed directly by `node` (no build step, erasable syntax only: no enums, no namespaces, no parameter properties).
- No shell scripts beyond one-line npm scripts.
- Full validation (`npm run validate`) runs locally only. CI runs only `npm run lint` and `npm run check-versions -- --github-issue`, weekly and on manual trigger.
- Images:
  - data-fair `ghcr.io/data-fair/data-fair:6`
  - simple-directory `ghcr.io/data-fair/simple-directory:8`
  - events `ghcr.io/data-fair/events:1`
  - openapi-viewer `ghcr.io/data-fair/openapi-viewer:2`
  - capture `ghcr.io/data-fair/capture:3`
  - portals `ghcr.io/data-fair/portals/manager:2` + `ghcr.io/data-fair/portals/portal:2`
  - metrics `ghcr.io/data-fair/metrics:2` + `ghcr.io/data-fair/metrics/daemon:2`
  - bonus:
    - registry `ghcr.io/data-fair/registry:0.6`
    - processings `ghcr.io/data-fair/processings:6` + `ghcr.io/data-fair/processings/worker:6`
    - catalogs `ghcr.io/data-fair/catalogs:1` + `ghcr.io/data-fair/catalogs/worker:1`
  - dependencies: `mongo:8.0`, `ghcr.io/data-fair/elasticsearch:8.19.9`, `maildev/maildev:2.2.1`, `nginx:1.29-alpine`, `jonasal/nginx-certbot:6-alpine`
- Not included: backup, agents, mcp, maps, tileserver, notify, thumbor, portals v1.
- Storage: data-fair `FILES_STORAGE=fs` on a named volume; no S3.
- One `SECRET` reused for all shared service secrets, plus a separate `CIPHER_PASSWORD`.
- Every service in every recipe has a compose `healthcheck`.
- Bonus services are documented as "bonus": the full plugin registry requires a koumoul.com subscription.
- Never copy secrets or internal hostnames from `~/koumoul/infrastructure` (read-only reference).
- `validated-versions.json` is only written by `scripts/validate.ts`, never by hand.

## Review Focus

1. **Re-running a recipe after the first start** (existing volumes, admin password already set): the smoke login must still succeed. `loginSuperadmin` tries the known password before the reset flow (Task 5).
2. **A bonus service whose container is absent:** nginx must still start, and must return 502 for `/processings/` rather than crash. This is covered by proxying through variables with the Docker resolver, and asserted in `bonus.spec.ts` as a negative check when `BONUS` is unset (Task 8).
3. **The first weekly run before any validation** (no `validated-versions.json`): check-versions must report "never validated" as action needed, not crash (Task 9 test).
4. **A config file path missing at a tag** (the repo layout changed): check-versions must report it as an action-needed finding, not throw (Task 9 test).
5. **Validation interrupted or failing midway:** `validate.ts` must still collect logs and tear the stack down (unless `--keep`), and must never write `validated-versions.json` on failure (Task 4 test on `shouldRecord`).

---

## File structure

```
package.json, package-lock.json, tsconfig.json, eslint.config.js, playwright.config.ts, .gitignore
README.md
MAINTENANCE.md
validated-versions.json                  (written by validate.ts in Task 12)
recipes/local/{README.md, compose.yaml, .env.example, nginx.conf.template}
recipes/production/{README.md, compose.yaml, compose.bonus.yaml, .env.example}
recipes/production/nginx/{http.conf, locations.conf, portal-locations.conf, bonus-locations.conf, site.conf.template}
docs/{portals.md, bonus-services.md, operations.md, upgrading.md}
scripts/validate.ts                      CLI: orchestrates one validation run
scripts/check-versions.ts                CLI: drift report (+ GitHub issue sync)
scripts/lint.ts                          CLI: compose config + links + eslint + tsc
scripts/lib/env.ts                       .env generation
scripts/lib/compose.ts                   docker compose runner, ps parsing, health wait
scripts/lib/recipes.ts                   recipe definitions: compose files per variant, env overrides for tests
scripts/lib/services.ts                  the service catalog (images, repos, config files, version source)
scripts/lib/versions.ts                  semver helpers, env-name extraction, schema required paths, set diff
scripts/lib/registries.ts                ghcr / docker hub tags, raw GitHub files
scripts/lib/drift.ts                     findings computation + markdown rendering (pure)
scripts/lib/github-issue.ts              single-issue sync
test/unit/*.spec.ts                      unit tests (Playwright "unit" project)
test/smoke/{support.ts, core.spec.ts, portals.spec.ts, metrics.spec.ts, bonus.spec.ts}
test/production/site.conf.template       HTTP-only server blocks for validating production
test/production.override.yaml
.github/workflows/drift.yaml
```

---

### Task 1: Repository tooling scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.js`, `playwright.config.ts`, `.gitignore`, `test/unit/scaffold.spec.ts`

**Interfaces:**
- Produces: npm scripts `test-unit`, `lint`, `validate`, `check-versions`. Playwright projects `unit` (testDir `test/unit`) and `smoke` (testDir `test/smoke`, baseURL from `SMOKE_BASE_URL`).

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@data-fair/install",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test-unit": "playwright test --project unit",
    "lint": "node scripts/lint.ts",
    "validate": "node scripts/validate.ts",
    "check-versions": "node scripts/check-versions.ts"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install -D @playwright/test typescript neostandard eslint @types/node`
Expected: `package-lock.json` created, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts", "test", "playwright.config.ts"]
}
```

- [ ] **Step 4: Create `eslint.config.js`**

```js
import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true }),
  { ignores: ['node_modules', 'test/reports', 'test-results', 'playwright-report'] }
]
```

- [ ] **Step 5: Create `playwright.config.ts`**

```ts
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
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules
test/reports
test-results
playwright-report
.env
```

- [ ] **Step 7: Write a trivial unit test to prove the runner works**

`test/unit/scaffold.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

test('node runs typescript directly', () => {
  const n: number = 1
  expect(n).toBe(1)
})
```

- [ ] **Step 8: Run it**

Run: `npm run test-unit`
Expected: `1 passed`.

- [ ] **Step 9: Run eslint and tsc**

Run: `npx eslint . && npx tsc`
Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.js playwright.config.ts .gitignore test/unit/scaffold.spec.ts
git commit -m "chore: node tooling scaffold (playwright, eslint, tsc)"
```

---

### Task 2: `.env` generation and compose helpers

**Files:**
- Create: `scripts/lib/env.ts`, `scripts/lib/compose.ts`
- Test: `test/unit/env.spec.ts`, `test/unit/compose.spec.ts`
- Delete: `test/unit/scaffold.spec.ts`

**Interfaces:**
- Produces:
  - `randomSecret(): string`
  - `fillEnv(example: string, overrides?: Record<string, string>): string`. It replaces every value equal to `CHANGE_ME` with a fresh random secret and applies overrides, appending keys that are absent.
  - `type ComposeProject = { dir: string, name: string, files: string[], envFile: string }`
  - `composeArgs(p: ComposeProject, ...args: string[]): string[]`
  - `runCompose(p: ComposeProject, args: string[], opts?: { inherit?: boolean }): Promise<{ code: number, stdout: string, stderr: string }>`
  - `type ContainerState = { service: string, state: string, health: string }`
  - `parsePs(output: string): ContainerState[]` (accepts NDJSON or a JSON array)
  - `notReady(states: ContainerState[]): ContainerState[]`
  - `waitHealthy(p: ComposeProject, timeoutMs: number, pollMs?: number): Promise<void>` (throws with the list of non-ready services)

- [ ] **Step 1: Write failing tests**

`test/unit/env.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { fillEnv, randomSecret } from '../../scripts/lib/env.ts'

test('randomSecret is long and url safe', () => {
  const s = randomSecret()
  expect(s).toMatch(/^[A-Za-z0-9_-]{32,}$/)
  expect(randomSecret()).not.toBe(s)
})

test('fillEnv replaces CHANGE_ME values and keeps comments', () => {
  const out = fillEnv('# comment\nSECRET=CHANGE_ME\nCIPHER_PASSWORD=CHANGE_ME\nBASE_URL=http://localhost\n')
  const lines = out.split('\n')
  expect(lines[0]).toBe('# comment')
  expect(lines[1]).toMatch(/^SECRET=[A-Za-z0-9_-]{32,}$/)
  expect(lines[2]).toMatch(/^CIPHER_PASSWORD=[A-Za-z0-9_-]{32,}$/)
  expect(lines[1].split('=')[1]).not.toBe(lines[2].split('=')[1])
  expect(lines[3]).toBe('BASE_URL=http://localhost')
})

test('fillEnv applies overrides and appends missing keys', () => {
  const out = fillEnv('DOMAIN=example.com\n', { DOMAIN: 'localhost', EXTRA: 'x' })
  expect(out).toContain('DOMAIN=localhost')
  expect(out).not.toContain('example.com')
  expect(out).toContain('EXTRA=x')
})

test('fillEnv keeps values containing = signs intact', () => {
  const out = fillEnv('MAILS_TRANSPORT={"host":"a=b"}\n')
  expect(out).toContain('MAILS_TRANSPORT={"host":"a=b"}')
})
```

`test/unit/compose.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { composeArgs, parsePs, notReady } from '../../scripts/lib/compose.ts'

const p = { dir: '/tmp/x', name: 'dfi-local', files: ['compose.yaml', 'override.yaml'], envFile: '.env' }

test('composeArgs puts project, env file and files first', () => {
  expect(composeArgs(p, 'up', '-d')).toEqual([
    'compose', '-p', 'dfi-local', '--env-file', '.env', '-f', 'compose.yaml', '-f', 'override.yaml', 'up', '-d'
  ])
})

test('parsePs accepts NDJSON', () => {
  const out = '{"Service":"mongo","State":"running","Health":"healthy"}\n{"Service":"nginx","State":"running","Health":""}\n'
  expect(parsePs(out)).toEqual([
    { service: 'mongo', state: 'running', health: 'healthy' },
    { service: 'nginx', state: 'running', health: '' }
  ])
})

test('parsePs accepts a JSON array and empty output', () => {
  expect(parsePs('[{"Service":"a","State":"exited","Health":""}]')).toEqual([{ service: 'a', state: 'exited', health: '' }])
  expect(parsePs('')).toEqual([])
})

test('notReady lists non running and non healthy containers', () => {
  const states = [
    { service: 'a', state: 'running', health: 'healthy' },
    { service: 'b', state: 'running', health: 'starting' },
    { service: 'c', state: 'exited', health: '' },
    { service: 'd', state: 'running', health: '' }
  ]
  expect(notReady(states).map(s => s.service)).toEqual(['b', 'c', 'd'])
})
```

`d` counts as not ready on purpose: every recipe service must declare a healthcheck (Global Constraints), so a running container without health status reveals a missing healthcheck.

- [ ] **Step 2: Run to verify they fail**

Run: `rm test/unit/scaffold.spec.ts && npm run test-unit`
Expected: FAIL, cannot find module `scripts/lib/env.ts`.

- [ ] **Step 3: Implement `scripts/lib/env.ts`**

```ts
import { randomBytes } from 'node:crypto'

export const randomSecret = (): string => randomBytes(32).toString('base64url')

export function fillEnv (example: string, overrides: Record<string, string> = {}): string {
  const seen = new Set<string>()
  const lines = example.split('\n').map(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) return line
    const [, key, value] = match
    seen.add(key)
    if (key in overrides) return `${key}=${overrides[key]}`
    if (value === 'CHANGE_ME') return `${key}=${randomSecret()}`
    return line
  })
  for (const [key, value] of Object.entries(overrides)) {
    if (!seen.has(key)) lines.push(`${key}=${value}`)
  }
  return lines.join('\n')
}
```

- [ ] **Step 4: Implement `scripts/lib/compose.ts`**

```ts
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

export type ComposeProject = { dir: string, name: string, files: string[], envFile: string }
export type ContainerState = { service: string, state: string, health: string }

export const composeArgs = (p: ComposeProject, ...args: string[]): string[] =>
  ['compose', '-p', p.name, '--env-file', p.envFile, ...p.files.flatMap(f => ['-f', f]), ...args]

export function runCompose (p: ComposeProject, args: string[], opts: { inherit?: boolean } = {}): Promise<{ code: number, stdout: string, stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', composeArgs(p, ...args), { cwd: p.dir, stdio: opts.inherit ? 'inherit' : 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', d => { stdout += d })
    child.stderr?.on('data', d => { stderr += d })
    child.on('error', reject)
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

export function parsePs (output: string): ContainerState[] {
  const trimmed = output.trim()
  if (!trimmed) return []
  const raw: any[] = trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed.split('\n').map(l => JSON.parse(l))
  return raw.map(c => ({ service: c.Service, state: c.State, health: c.Health ?? '' }))
}

export const notReady = (states: ContainerState[]): ContainerState[] =>
  states.filter(s => s.state !== 'running' || s.health !== 'healthy')

export async function waitHealthy (p: ComposeProject, timeoutMs: number, pollMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let pending: ContainerState[] = []
  while (Date.now() < deadline) {
    const { stdout } = await runCompose(p, ['ps', '--all', '--format', 'json'])
    const states = parsePs(stdout)
    pending = notReady(states)
    if (states.length && !pending.length) return
    if (pending.some(s => s.state === 'exited' || s.health === 'unhealthy')) break
    await sleep(pollMs)
  }
  throw new Error('services not healthy: ' + pending.map(s => `${s.service} (${s.state}/${s.health || 'no healthcheck'})`).join(', '))
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test-unit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib test/unit
git commit -m "feat(scripts): env generation and docker compose helpers"
```

---

### Task 3: Lint script

**Files:**
- Create: `scripts/lib/recipes.ts`, `scripts/lint.ts`
- Test: `test/unit/recipes.spec.ts`

**Interfaces:**
- Produces:
  - `type Variant = 'local' | 'production' | 'production+bonus'`
  - `VARIANTS: Variant[]`
  - `recipeDir(v: Variant): string` (absolute)
  - `composeFiles(v: Variant, opts: { test: boolean }): string[]`. Paths are relative to the recipe dir. With `test: true`, production variants add `../../test/production.override.yaml`.
  - `testEnvOverrides(v: Variant): Record<string, string>`
  - `parseVariantArgs(argv: string[]): { variant: Variant, keep: boolean }`. It accepts `local`, `production`, and `production --bonus`.

- [ ] **Step 1: Write failing test**

`test/unit/recipes.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { composeFiles, parseVariantArgs, testEnvOverrides } from '../../scripts/lib/recipes.ts'

test('compose files per variant', () => {
  expect(composeFiles('local', { test: true })).toEqual(['compose.yaml'])
  expect(composeFiles('production', { test: false })).toEqual(['compose.yaml'])
  expect(composeFiles('production', { test: true })).toEqual(['compose.yaml', '../../test/production.override.yaml'])
  expect(composeFiles('production+bonus', { test: true })).toEqual(['compose.yaml', 'compose.bonus.yaml', '../../test/production.override.yaml'])
})

test('parseVariantArgs', () => {
  expect(parseVariantArgs(['local'])).toEqual({ variant: 'local', keep: false })
  expect(parseVariantArgs(['production', '--bonus', '--keep'])).toEqual({ variant: 'production+bonus', keep: true })
  expect(() => parseVariantArgs(['local', '--bonus'])).toThrow(/bonus/)
  expect(() => parseVariantArgs([])).toThrow(/usage/)
})

test('production test overrides point to localhost over http', () => {
  expect(testEnvOverrides('production')).toMatchObject({ DOMAIN: 'localhost', BASE_URL: 'http://localhost' })
  expect(testEnvOverrides('local')).toEqual({})
})
```

- [ ] **Step 2: Run, expect FAIL** (module not found)

Run: `npm run test-unit`

- [ ] **Step 3: Implement `scripts/lib/recipes.ts`**

```ts
import { resolve } from 'node:path'

export type Variant = 'local' | 'production' | 'production+bonus'
export const VARIANTS: Variant[] = ['local', 'production', 'production+bonus']

const root = resolve(import.meta.dirname, '../..')
export const recipeDir = (v: Variant): string => resolve(root, 'recipes', v === 'local' ? 'local' : 'production')

export function composeFiles (v: Variant, opts: { test: boolean }): string[] {
  if (v === 'local') return ['compose.yaml']
  const files = ['compose.yaml']
  if (v === 'production+bonus') files.push('compose.bonus.yaml')
  if (opts.test) files.push('../../test/production.override.yaml')
  return files
}

export function testEnvOverrides (v: Variant): Record<string, string> {
  if (v === 'local') return {}
  return {
    DOMAIN: 'localhost',
    BASE_URL: 'http://localhost',
    CONTACT_EMAIL: 'admin@example.com',
    ADMINS: '["admin@example.com"]',
    MAILS_TRANSPORT: '{"host":"maildev","port":1025,"ignoreTLS":true}'
  }
}

export function parseVariantArgs (argv: string[]): { variant: Variant, keep: boolean } {
  const [recipe, ...flags] = argv
  if (recipe !== 'local' && recipe !== 'production') throw new Error('usage: validate <local|production> [--bonus] [--keep]')
  const bonus = flags.includes('--bonus')
  if (bonus && recipe === 'local') throw new Error('--bonus only applies to the production recipe')
  return { variant: bonus ? 'production+bonus' : recipe, keep: flags.includes('--keep') }
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Implement `scripts/lint.ts`**

The script:
- runs `docker compose config -q` per variant (with and without test overrides) using `.env.example`;
- runs lychee through docker on all markdown;
- runs eslint and tsc.

It keeps going after a failure and exits 1 if any step failed. Recipes that don't exist yet are skipped, with a notice.

```ts
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { VARIANTS, recipeDir, composeFiles } from './lib/recipes.ts'
import { composeArgs } from './lib/compose.ts'

const root = resolve(import.meta.dirname, '..')
let failed = false

function step (label: string, cmd: string, args: string[], cwd = root) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (r.status !== 0) { failed = true; console.error(`✖ ${label}`) }
}

for (const variant of VARIANTS) {
  const dir = recipeDir(variant)
  for (const test of [false, true]) {
    const files = composeFiles(variant, { test })
    if (!files.every(f => existsSync(resolve(dir, f)))) { console.log(`- skip ${variant}${test ? ' (test)' : ''}: files missing`); continue }
    const p = { dir, name: 'dfi-lint', files, envFile: '.env.example' }
    step(`compose config ${variant}${test ? ' (test)' : ''}`, 'docker', composeArgs(p, 'config', '-q'), dir)
  }
}

step('markdown links', 'docker', [
  'run', '--rm', '-v', `${root}:/input:ro`, '-w', '/input', 'lycheeverse/lychee:latest',
  '--no-progress', '--exclude-loopback', '--exclude', 'localhost', '--exclude', 'example\\.com',
  '--exclude-path', 'node_modules', '--exclude-path', 'docs/superpowers', '.'
])
step('eslint', 'npx', ['eslint', '.'])
step('tsc', 'npx', ['tsc'])

process.exit(failed ? 1 : 0)
```

- [ ] **Step 6: Run it**

Run: `npm run lint`
Expected: compose steps are skipped (no recipes yet); links, eslint and tsc pass; exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts test/unit
git commit -m "feat(scripts): recipe variants and lint script"
```

---

### Task 4: Validation orchestrator

**Files:**
- Create: `scripts/validate.ts`, `scripts/lib/services.ts` (initial version, extended in Task 9)
- Test: `test/unit/validate.spec.ts`

**Interfaces:**
- Consumes: `fillEnv` (Task 2); `ComposeProject`, `runCompose`, `waitHealthy` (Task 2); `parseVariantArgs`, `recipeDir`, `composeFiles`, `testEnvOverrides` (Task 3).
- Produces:
  - `type VersionSource = 'label' | 'mongo' | 'elasticsearch'`
  - `type Service = { key: string, composeServices: string[], image: string, registry: 'ghcr' | 'dockerhub', repo?: string, configFiles?: string[], track: 'major' | 'minor', variants: Variant[], versionFrom: VersionSource }`
  - `SERVICES: Service[]`
  - `servicesFor(v: Variant): Service[]`
  - `type ValidatedVersions = { date: string, runs: Record<Variant, string>, versions: Record<string, string> }`
  - `mergeValidated(prev: ValidatedVersions | null, variant: Variant, date: string, versions: Record<string, string>): ValidatedVersions`
  - `shouldRecord(result: { healthy: boolean, smokeCode: number }): boolean`
  - CLI `npm run validate -- <local|production> [--bonus] [--keep]`. It writes `test/reports/<date>-<variant>.md`; on success it updates `validated-versions.json` and the README "Last validated" block.

- [ ] **Step 1: Write failing tests**

`test/unit/validate.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { mergeValidated, shouldRecord, servicesFor, renderLastValidated } from '../../scripts/lib/services.ts'

test('shouldRecord only on full success', () => {
  expect(shouldRecord({ healthy: true, smokeCode: 0 })).toBe(true)
  expect(shouldRecord({ healthy: true, smokeCode: 1 })).toBe(false)
  expect(shouldRecord({ healthy: false, smokeCode: 0 })).toBe(false)
})

test('mergeValidated keeps versions of services not covered by this run', () => {
  const prev = { date: '2026-01-01', runs: { local: '2026-01-01' } as any, versions: { 'data-fair': '6.1.0', metrics: '2.0.0' } }
  const next = mergeValidated(prev, 'local', '2026-02-01', { 'data-fair': '6.2.0' })
  expect(next.versions).toEqual({ 'data-fair': '6.2.0', metrics: '2.0.0' })
  expect(next.runs.local).toBe('2026-02-01')
  expect(next.date).toBe('2026-02-01')
})

test('mergeValidated from scratch', () => {
  expect(mergeValidated(null, 'production', '2026-02-01', { mongo: '8.0.17' })).toEqual({
    date: '2026-02-01', runs: { production: '2026-02-01' }, versions: { mongo: '8.0.17' }
  })
})

test('services per variant', () => {
  const local = servicesFor('local').map(s => s.key)
  expect(local).toContain('portals')
  expect(local).not.toContain('metrics')
  expect(local).not.toContain('processings')
  expect(servicesFor('production').map(s => s.key)).toContain('metrics')
  expect(servicesFor('production+bonus').map(s => s.key)).toContain('registry')
})

test('renderLastValidated', () => {
  const md = renderLastValidated({ date: '2026-02-01', runs: { local: '2026-02-01' } as any, versions: { 'data-fair': '6.2.0' } })
  expect(md).toContain('2026-02-01')
  expect(md).toContain('| data-fair | 6.2.0 |')
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/services.ts`**

The config file paths come from the service repos at `~/data-fair/<repo>`. Before writing them, check each one exists with `ls ~/data-fair/<repo>/<path>` and fix any that doesn't.

```ts
import type { Variant } from './recipes.ts'

export type VersionSource = 'label' | 'mongo' | 'elasticsearch'
export type Service = {
  key: string
  composeServices: string[]
  image: string
  registry: 'ghcr' | 'dockerhub'
  repo?: string
  configFiles?: string[]
  track: 'major' | 'minor'
  variants: Variant[]
  versionFrom: VersionSource
}

const all: Variant[] = ['local', 'production', 'production+bonus']
const prod: Variant[] = ['production', 'production+bonus']
const bonus: Variant[] = ['production+bonus']

export const SERVICES: Service[] = [
  { key: 'data-fair', composeServices: ['data-fair', 'data-fair-worker'], image: 'ghcr.io/data-fair/data-fair', registry: 'ghcr', repo: 'data-fair/data-fair', configFiles: ['api/config/custom-environment-variables.cjs', 'api/config/type/schema.json'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'simple-directory', composeServices: ['simple-directory'], image: 'ghcr.io/data-fair/simple-directory', registry: 'ghcr', repo: 'data-fair/simple-directory', configFiles: ['api/config/custom-environment-variables.cjs', 'api/config/type/schema.json'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'events', composeServices: ['events'], image: 'ghcr.io/data-fair/events', registry: 'ghcr', repo: 'data-fair/events', configFiles: ['api/config/custom-environment-variables.cjs', 'api/config/type/schema.json'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'openapi-viewer', composeServices: ['openapi-viewer'], image: 'ghcr.io/data-fair/openapi-viewer', registry: 'ghcr', repo: 'data-fair/openapi-viewer', configFiles: ['api/config/custom-environment-variables.cjs'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'capture', composeServices: ['capture'], image: 'ghcr.io/data-fair/capture', registry: 'ghcr', repo: 'data-fair/capture', configFiles: ['config/custom-environment-variables.cjs'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'portals', composeServices: ['portals-manager', 'portal'], image: 'ghcr.io/data-fair/portals/manager', registry: 'ghcr', repo: 'data-fair/portals', configFiles: ['api/config/custom-environment-variables.js', 'portal/nuxt.config.ts'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'metrics', composeServices: ['metrics', 'metrics-daemon'], image: 'ghcr.io/data-fair/metrics', registry: 'ghcr', repo: 'data-fair/metrics', configFiles: ['api/config/custom-environment-variables.cjs', 'daemon/config/custom-environment-variables.cjs'], track: 'major', variants: prod, versionFrom: 'label' },
  { key: 'registry', composeServices: ['registry'], image: 'ghcr.io/data-fair/registry', registry: 'ghcr', repo: 'data-fair/registry', configFiles: ['api/config/custom-environment-variables.cjs'], track: 'minor', variants: bonus, versionFrom: 'label' },
  { key: 'processings', composeServices: ['processings', 'processings-worker'], image: 'ghcr.io/data-fair/processings', registry: 'ghcr', repo: 'data-fair/processings', configFiles: ['api/config/custom-environment-variables.cjs', 'worker/config/custom-environment-variables.cjs'], track: 'major', variants: bonus, versionFrom: 'label' },
  { key: 'catalogs', composeServices: ['catalogs', 'catalogs-worker'], image: 'ghcr.io/data-fair/catalogs', registry: 'ghcr', repo: 'data-fair/catalogs', configFiles: ['api/config/custom-environment-variables.cjs', 'worker/config/custom-environment-variables.cjs'], track: 'major', variants: bonus, versionFrom: 'label' },
  { key: 'mongo', composeServices: ['mongo'], image: 'mongo', registry: 'dockerhub', track: 'minor', variants: all, versionFrom: 'mongo' },
  { key: 'elasticsearch', composeServices: ['elasticsearch'], image: 'ghcr.io/data-fair/elasticsearch', registry: 'ghcr', track: 'minor', variants: all, versionFrom: 'elasticsearch' }
]

export const servicesFor = (v: Variant): Service[] => SERVICES.filter(s => s.variants.includes(v))

export type ValidatedVersions = { date: string, runs: Partial<Record<Variant, string>>, versions: Record<string, string> }

export function mergeValidated (prev: ValidatedVersions | null, variant: Variant, date: string, versions: Record<string, string>): ValidatedVersions {
  return {
    date,
    runs: { ...prev?.runs, [variant]: date },
    versions: { ...prev?.versions, ...versions }
  }
}

export const shouldRecord = (r: { healthy: boolean, smokeCode: number }): boolean => r.healthy && r.smokeCode === 0

export function renderLastValidated (v: ValidatedVersions): string {
  const runs = Object.entries(v.runs).map(([k, d]) => `${k} (${d})`).join(', ')
  const rows = Object.entries(v.versions).sort().map(([k, ver]) => `| ${k} | ${ver} |`).join('\n')
  return `Last validated on ${v.date}: ${runs}.\n\n| Service | Version |\n|---|---|\n${rows}\n`
}
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Implement `scripts/validate.ts`**

```ts
import { cp, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir, freemem, totalmem } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseVariantArgs, recipeDir, composeFiles, testEnvOverrides } from './lib/recipes.ts'
import { fillEnv } from './lib/env.ts'
import { runCompose, waitHealthy, type ComposeProject } from './lib/compose.ts'
import { servicesFor, mergeValidated, shouldRecord, renderLastValidated, type Service, type ValidatedVersions } from './lib/services.ts'

const root = resolve(import.meta.dirname, '..')
const { variant, keep } = parseVariantArgs(process.argv.slice(2))
const date = new Date().toISOString().slice(0, 10)
const report: string[] = [`# Validation ${variant} – ${date}`, '']
const log = (line: string) => { console.log(line); report.push(line) }

// 1. prerequisites
const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' })
if (docker.status !== 0) throw new Error('docker compose v2 is required')
const minMemGb = variant === 'local' ? 6 : 10
if (totalmem() / 1e9 < minMemGb) console.warn(`⚠ less than ${minMemGb}GB of total memory, the stack may not fit`)
log(`- free memory at start: ${(freemem() / 1e9).toFixed(1)}GB`)

// 2. copy the recipe to a temp dir, like a user would, and create .env
const work = await mkdtemp(join(tmpdir(), `dfi-${variant.replace('+', '-')}-`))
await cp(resolve(root, 'recipes'), join(work, 'recipes'), { recursive: true })
await cp(resolve(root, 'test'), join(work, 'test'), { recursive: true, filter: src => !src.includes('reports') })
const dir = join(work, 'recipes', variant === 'local' ? 'local' : 'production')
const example = await readFile(join(recipeDir(variant), '.env.example'), 'utf8')
await writeFile(join(dir, '.env'), fillEnv(example, testEnvOverrides(variant)))
const p: ComposeProject = { dir, name: `dfi-${variant.replace('+', '-')}`, files: composeFiles(variant, { test: true }), envFile: '.env' }
log(`- work dir: ${dir}`)

let healthy = false
let smokeCode = 1
let versions: Record<string, string> = {}
try {
  // 3. start, exactly as documented (README says: docker compose up -d)
  const up = await runCompose(p, ['up', '-d', '--pull', 'always', '--quiet-pull'], { inherit: true })
  if (up.code !== 0) throw new Error('docker compose up failed')
  await waitHealthy(p, 10 * 60_000)
  healthy = true
  log('- all containers healthy')

  // 4. smoke tests
  const env = await readFile(join(dir, '.env'), 'utf8')
  const smoke = spawnSync('npx', ['playwright', 'test', '--project', 'smoke'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      SMOKE_BASE_URL: 'http://localhost',
      SMOKE_VARIANT: variant,
      SMOKE_ADMIN_EMAIL: 'admin@example.com',
      SMOKE_ENV: env,
      SMOKE_COMPOSE_DIR: dir,
      SMOKE_COMPOSE_PROJECT: p.name
    }
  })
  smokeCode = smoke.status ?? 1
  log(`- smoke tests: ${smokeCode === 0 ? 'passed' : 'FAILED'}`)

  // 5. read running versions
  versions = await readVersions(p, servicesFor(variant))
  log('', '| Service | Version |', '|---|---|', ...Object.entries(versions).map(([k, v]) => `| ${k} | ${v} |`))
} catch (err: any) {
  log(`- ERROR: ${err.message}`)
  const ps = await runCompose(p, ['ps', '--all'])
  const logs = await runCompose(p, ['logs', '--no-color', '--tail', '80'])
  report.push('', '## docker compose ps', '```', ps.stdout, '```', '', '## logs (tail)', '```', logs.stdout, '```')
} finally {
  if (!keep) {
    await runCompose(p, ['down', '-v', '--remove-orphans'], { inherit: true })
    await rm(work, { recursive: true, force: true })
  } else {
    log(`- --keep: stack left running, stop it with: cd ${dir} && docker compose -p ${p.name} ${p.files.map(f => `-f ${f}`).join(' ')} down -v`)
  }
}

const ok = shouldRecord({ healthy, smokeCode })
await mkdir(resolve(root, 'test/reports'), { recursive: true })
const reportPath = resolve(root, `test/reports/${date}-${variant.replace('+', '-')}.md`)
await writeFile(reportPath, report.join('\n') + '\n')
console.log(`report: ${reportPath}`)

if (ok) {
  const vPath = resolve(root, 'validated-versions.json')
  const prev: ValidatedVersions | null = existsSync(vPath) ? JSON.parse(await readFile(vPath, 'utf8')) : null
  const next = mergeValidated(prev, variant, date, versions)
  await writeFile(vPath, JSON.stringify(next, null, 2) + '\n')
  const readmePath = resolve(root, 'README.md')
  const readme = await readFile(readmePath, 'utf8')
  const block = `<!-- last-validated -->\n${renderLastValidated(next)}<!-- /last-validated -->`
  await writeFile(readmePath, readme.replace(/<!-- last-validated -->[\s\S]*<!-- \/last-validated -->/, block))
  console.log('✔ validated-versions.json and README updated, commit them')
}
process.exit(ok ? 0 : 1)

async function readVersions (p: ComposeProject, services: Service[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const s of services) {
    const svc = s.composeServices[0]
    if (s.versionFrom === 'label') {
      const id = (await runCompose(p, ['ps', '-q', svc])).stdout.trim()
      const r = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.version"}}', id], { encoding: 'utf8' })
      out[s.key] = r.stdout.trim() || 'unknown'
    } else if (s.versionFrom === 'mongo') {
      out[s.key] = (await runCompose(p, ['exec', '-T', svc, 'mongosh', '--quiet', '--eval', 'db.version()'])).stdout.trim()
    } else {
      const r = await runCompose(p, ['exec', '-T', svc, 'curl', '-s', 'localhost:9200'])
      out[s.key] = JSON.parse(r.stdout).version.number
    }
  }
  return out
}
```

- [ ] **Step 6: Check it fails cleanly while no recipe exists**

Run: `npm run validate -- local`
Expected: an error saying `.env.example` is missing under `recipes/local` (ENOENT), exit code non-zero. It must not write `validated-versions.json`.

- [ ] **Step 7: Run unit tests, eslint, tsc**

Run: `npm run test-unit && npx eslint . && npx tsc`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add scripts test/unit
git commit -m "feat(scripts): validation orchestrator"
```

---

### Task 5: Local recipe, core services, and core smoke tests

**Files:**
- Create: `test/smoke/support.ts`, `test/smoke/core.spec.ts`, `recipes/local/compose.yaml`, `recipes/local/.env.example`, `recipes/local/nginx.conf.template`, `recipes/local/proxy.conf`, `README.md` (skeleton containing the last-validated markers)

**Interfaces:**
- Consumes: `npm run validate -- local` (Task 4).
- Produces:
  - `test/smoke/support.ts` exports:
    - `ADMIN_EMAIL: string`
    - `ADMIN_PASSWORD: string`
    - `variant: 'local' | 'production' | 'production+bonus'`
    - `envValue(key: string): string` (reads `SMOKE_ENV`)
    - `loginSuperadmin(request: APIRequestContext): Promise<void>`
    - `latestMail(request: APIRequestContext, to: string, after: number): Promise<{ html: string, subject: string }>`
    - `createDataset(request: APIRequestContext, title: string): Promise<string>` (resolves the dataset id once finalized)
  - Compose service names used by later tasks: `nginx`, `data-fair`, `data-fair-worker`, `simple-directory`, `events`, `openapi-viewer`, `capture`, `mongo`, `elasticsearch`, `maildev`.

- [ ] **Step 1: Write `test/smoke/support.ts`**

```ts
import { expect, type APIRequestContext } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'

export const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com'
export const ADMIN_PASSWORD = 'Smoke-test-Passw0rd!'
export const variant = (process.env.SMOKE_VARIANT ?? 'local') as 'local' | 'production' | 'production+bonus'

export function envValue (key: string): string {
  const line = (process.env.SMOKE_ENV ?? '').split('\n').find(l => l.startsWith(key + '='))
  if (!line) throw new Error(`missing ${key} in .env`)
  return line.slice(key.length + 1)
}

export async function latestMail (request: APIRequestContext, to: string, after: number) {
  for (let i = 0; i < 30; i++) {
    const res = await request.get('/mails/email')
    expect(res.ok()).toBeTruthy()
    const mails: any[] = await res.json()
    const mail = mails.reverse().find(m => m.to?.some((t: any) => t.address === to) && new Date(m.date).getTime() >= after)
    if (mail) return { html: mail.html as string, subject: mail.subject as string }
    await sleep(2000)
  }
  throw new Error(`no mail received for ${to}`)
}

async function passwordLogin (request: APIRequestContext) {
  return request.post('/simple-directory/api/auth/password', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
}

// idempotent: works on a fresh stack (reset flow through maildev) and on a stack where the password is already set
export async function loginSuperadmin (request: APIRequestContext) {
  if ((await passwordLogin(request)).ok()) return
  const start = Date.now() - 1000
  const action = await request.post('/simple-directory/api/auth/action', { data: { email: ADMIN_EMAIL, action: 'changePassword' } })
  expect(action.status()).toBe(204)
  const mail = await latestMail(request, ADMIN_EMAIL, start)
  const token = mail.html.match(/action_token=([\w.-]+)/)?.[1]
  expect(token, 'action token in reset mail').toBeTruthy()
  const { id } = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString())
  const change = await request.post(`/simple-directory/api/users/${id}/password?action_token=${token}`, { data: { password: ADMIN_PASSWORD } })
  expect(change.status(), await change.text()).toBe(204)
  const login = await passwordLogin(request)
  expect(login.ok(), await login.text()).toBeTruthy()
}

export async function createDataset (request: APIRequestContext, title: string): Promise<string> {
  const csv = 'id,label,value\n1,one,1.5\n2,two,2.5\n3,three,3.5\n'
  const res = await request.post('/data-fair/api/v1/datasets', {
    multipart: { title, file: { name: 'smoke.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } }
  })
  expect(res.status(), await res.text()).toBe(201)
  const { id } = await res.json()
  for (let i = 0; i < 90; i++) {
    const d = await (await request.get(`/data-fair/api/v1/datasets/${id}`)).json()
    if (d.status === 'finalized') return id
    if (d.status === 'error') throw new Error(`dataset in error: ${JSON.stringify(d.errorStatus ?? d)}`)
    await sleep(2000)
  }
  throw new Error('dataset not finalized in time')
}
```

- [ ] **Step 2: Write `test/smoke/core.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { loginSuperadmin, createDataset } from './support.ts'

test.describe.configure({ mode: 'serial' })

test('every service answers through nginx', async ({ request }) => {
  for (const path of [
    '/data-fair/api/v1/ping',
    '/simple-directory/.well-known/jwks.json',
    '/events/api/ping',
    '/openapi-viewer/',
    '/mails/'
  ]) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(200)
  }
  const root = await request.get('/', { maxRedirects: 0 })
  expect(root.status()).toBe(302)
  expect(root.headers().location).toContain('/data-fair/')
})

test('superadmin logs in and data-fair sees the session', async ({ request }) => {
  await loginSuperadmin(request)
  const me = await request.get('/simple-directory/api/auth/me')
  expect(me.ok()).toBeTruthy()
  expect((await me.json()).isAdmin).toBe(true)
})

test('upload a csv, finalize it, query it', async ({ request }) => {
  await loginSuperadmin(request)
  const id = await createDataset(request, 'Smoke dataset')
  const lines = await (await request.get(`/data-fair/api/v1/datasets/${id}/lines`)).json()
  expect(lines.total).toBe(3)
  const apiDoc = await request.get(`/data-fair/api/v1/datasets/${id}/api-docs.json`)
  expect(apiDoc.ok()).toBeTruthy()
  expect((await apiDoc.json()).openapi).toMatch(/^3\./)
})

test('capture renders a screenshot', async ({ request, baseURL }) => {
  await loginSuperadmin(request)
  const res = await request.get(`/capture/api/v1/screenshot?target=${encodeURIComponent(baseURL + '/data-fair/')}`, { timeout: 120_000 })
  expect(res.status(), await res.text()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/^image\//)
})
```

- [ ] **Step 3: Create a minimal `README.md` skeleton** so `validate.ts` can write the block (the full README comes in Task 11)

```markdown
# Data Fair installation

Self-hosting recipes for the Data Fair stack, based on Docker Compose.

<!-- last-validated -->
Not validated yet.
<!-- /last-validated -->
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm run validate -- local`
Expected: FAIL, with `.env.example` missing in `recipes/local`.

- [ ] **Step 5: Create `recipes/local/.env.example`**

```bash
# Public URL of the platform: protocol + host (+ port if not 80)
BASE_URL=http://localhost

# Replace CHANGE_ME values with long random strings, e.g. the output of: openssl rand -base64 32
# SECRET is shared by the services to authenticate each other, CIPHER_PASSWORD encrypts sensitive data in the database.
SECRET=CHANGE_ME
CIPHER_PASSWORD=CHANGE_ME

# Super administrators (JSON array of emails)
ADMINS=["admin@example.com"]
```

- [ ] **Step 6: Create `recipes/local/nginx.conf.template`**

No prefix is stripped: most services require their prefix, and the few that make it optional (data-fair, capture, openapi-viewer) accept it too, so every location passes the URI through unchanged. Upstreams go through variables and the Docker resolver: nginx then starts even when an upstream container is missing, and answers 502 for it.

```nginx
# nginx configuration for the local Data Fair recipe
# rendered by the nginx image: ${BASE_URL}-style variables are replaced at startup

server {
  listen 80 default_server;
  server_name localhost;

  include /etc/nginx/includes/proxy.conf;

  location = / {
    return 302 /data-fair/;
  }

  location /data-fair/ { set $upstream http://data-fair:8080; proxy_pass $upstream; }
  location /simple-directory/ { set $upstream http://simple-directory:8080; proxy_pass $upstream; }
  location /events/ { set $upstream http://events:8080; proxy_pass $upstream; }
  location /openapi-viewer/ { set $upstream http://openapi-viewer:8080; proxy_pass $upstream; }
  location /capture/ { set $upstream http://capture:8080; proxy_pass $upstream; }
  location /portals-manager/ { set $upstream http://portals-manager:8080; proxy_pass $upstream; }
  location /mails/ { set $upstream http://maildev:1080; proxy_pass $upstream; }
}

# portals, served on subdomains: http://{portal id}.portal.localhost
server {
  listen 80;
  server_name ~^.+\.portal\.localhost$;

  include /etc/nginx/includes/proxy.conf;

  location /data-fair/ { set $upstream http://data-fair:8080; proxy_pass $upstream; }
  location /simple-directory/ { set $upstream http://simple-directory:8080; proxy_pass $upstream; }
  location /events/ { set $upstream http://events:8080; proxy_pass $upstream; }
  location /openapi-viewer/ { set $upstream http://openapi-viewer:8080; proxy_pass $upstream; }
  location / { set $upstream http://portal:8080; proxy_pass $upstream; }
}
```

The shared proxy settings go in the same folder as `proxy.conf`. They are mounted as an include and copied verbatim into production later. Create `recipes/local/proxy.conf`:

```nginx
# use docker's DNS so that containers can be restarted or missing without breaking nginx
resolver 127.0.0.11 valid=10s ipv6=off;

# transmit host, protocol and user ip, used for routing, rate limiting, etc.
proxy_set_header Host $http_host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $http_host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Client-IP $remote_addr;
# better private caching
proxy_set_header X-Private-If-Modified-Since $http_if_modified_since;
proxy_set_header X-Private-If-None-Match $http_if_none_match;
proxy_pass_header X-Accel-Buffering;
# websockets
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "Upgrade";
# range requests
proxy_set_header Range $http_range;
# occasional long queries
proxy_read_timeout 600s;
# body size limits are implemented by the services themselves
client_max_body_size 0;
# streaming of uploads and downloads (services enable buffering with the X-Accel-Buffering header)
proxy_request_buffering off;
proxy_buffering off;
# large response headers (session cookies)
proxy_buffer_size 32k;
proxy_buffers 4 32k;
```


- [ ] **Step 7: Create `recipes/local/compose.yaml`**

```yaml
# Data Fair – local recipe
# usage: cp .env.example .env, edit .env, then: docker compose up -d

x-healthcheck: &healthcheck
  interval: 10s
  timeout: 5s
  retries: 30
  start_period: 20s

x-data-fair-env: &data-fair-env
  PUBLIC_URL: ${BASE_URL}/data-fair
  DIRECTORY_URL: ${BASE_URL}/simple-directory
  PRIVATE_DIRECTORY_URL: http://simple-directory:8080
  PRIVATE_EVENTS_URL: http://events:8080
  CAPTURE_URL: ${BASE_URL}/capture
  PRIVATE_CAPTURE_URL: http://capture:8080
  PRIVATE_OPENAPI_VIEWER_URL: http://openapi-viewer:8080
  PRIVATE_PORTALS_MANAGER_URL: http://portals-manager:8080
  MONGO_URL: mongodb://mongo:27017/data-fair
  ES_HOST: elasticsearch:9200
  SECRET_IDENTITIES: ${SECRET}
  SECRET_EVENTS: ${SECRET}
  SECRET_SENDMAILS: ${SECRET}
  OBSERVER_ACTIVE: 'false'

services:

  nginx:
    image: nginx:1.29-alpine
    restart: unless-stopped
    ports:
      - 80:80
    volumes:
      - ./nginx.conf.template:/etc/nginx/templates/default.conf.template:ro
      - ./proxy.conf:/etc/nginx/includes/proxy.conf:ro
    environment:
      BASE_URL: ${BASE_URL}
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1/mails/']

  data-fair:
    image: ghcr.io/data-fair/data-fair:6
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy }, elasticsearch: { condition: service_healthy } }
    volumes:
      - data-fair-data:/data
    environment:
      <<: *data-fair-env
      MODE: server
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/v1/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  data-fair-worker:
    image: ghcr.io/data-fair/data-fair:6
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy }, elasticsearch: { condition: service_healthy } }
    volumes:
      - data-fair-data:/data
    environment:
      <<: *data-fair-env
      MODE: worker
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "require('net').connect(9090).on('error', () => process.exit(0)).on('connect', () => process.exit(0))"]

  simple-directory:
    image: ghcr.io/data-fair/simple-directory:8
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    environment:
      PUBLIC_URL: ${BASE_URL}/simple-directory
      MONGO_URL: mongodb://mongo:27017/simple-directory
      CIPHER_PASSWORD: ${CIPHER_PASSWORD}
      ADMINS: ${ADMINS}
      CONTACT: ${CONTACT_EMAIL:-admin@example.com}
      HOME_PAGE: ${BASE_URL}/data-fair/
      MAILS_TRANSPORT: '{"host":"maildev","port":1025,"ignoreTLS":true}'
      MAILS_FROM: ${CONTACT_EMAIL:-admin@example.com}
      MAILDEV_ACTIVE: 'true'
      MAILDEV_URL: ${BASE_URL}/mails/
      PRIVATE_EVENTS_URL: http://events:8080
      IDENTITIES_WEBHOOKS: '[{"base":"http://data-fair:8080/api/v1/identities","key":"${SECRET}"},{"base":"http://events:8080/api/identities","key":"${SECRET}"},{"base":"http://portals-manager:8080/api/identities","key":"${SECRET}"}]'
      SECRET_SENDMAILS: ${SECRET}
      SECRET_EVENTS: ${SECRET}
      SECRET_SITES: ${SECRET}
      MANAGE_SITES: 'true'
      MANAGE_DEPARTMENTS: 'true'
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/.well-known/jwks.json').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  events:
    image: ghcr.io/data-fair/events:1
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    environment:
      MONGO_URL: mongodb://mongo:27017/events
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      SECRET_IDENTITIES: ${SECRET}
      SECRET_EVENTS: ${SECRET}
      SECRET_SENDMAILS: ${SECRET}
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  openapi-viewer:
    image: ghcr.io/data-fair/openapi-viewer:2
    restart: unless-stopped
    environment:
      USE_SIMPLE_DIRECTORY: 'true'
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      ALLOWED_URLS: '{"dataFair":"/data-fair/api/v1/api-docs.json","dataset":"/data-fair/api/v1/datasets/{id}/api-docs.json","datasetPrivate":"/data-fair/api/v1/datasets/{id}/private-api-docs.json","application":"/data-fair/api/v1/applications/{id}/api-docs.json"}'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/openapi-viewer/').then(r => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]

  capture:
    image: ghcr.io/data-fair/capture:3
    restart: unless-stopped
    shm_size: 1gb
    environment:
      PUBLIC_URL: ${BASE_URL}/capture
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      ONLY_SAME_HOST: 'true'
      PUPPETEER_ARGS: '["--no-sandbox"]'
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/v1/screenshot').then(r => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]

  maildev:
    image: maildev/maildev:2.2.1
    restart: unless-stopped
    environment:
      MAILDEV_BASE_PATHNAME: /mails
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:1080/mails/healthz']

  elasticsearch:
    image: ghcr.io/data-fair/elasticsearch:8.19.9
    restart: unless-stopped
    volumes:
      - elasticsearch-data:/usr/share/elasticsearch/data
    environment:
      discovery.type: single-node
      xpack.security.enabled: 'false'
      ingest.geoip.downloader.enabled: 'false'
      ES_JAVA_OPTS: -Xms1g -Xmx1g
    healthcheck:
      <<: *healthcheck
      test: ['CMD-SHELL', 'curl -fs "localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s"']

  mongo:
    image: mongo:8.0
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'mongosh', '--quiet', '--eval', 'db.runCommand({ ping: 1 }).ok']

volumes:
  data-fair-data:
  elasticsearch-data:
  mongo-data:
```

The portals services referenced by nginx and the webhooks come in Task 6. Until then those routes return 502, and simple-directory's webhook to portals fails without blocking anything.

- [ ] **Step 8: Check the assumptions the compose file makes, before running**

Run each command and adjust the compose file if the result differs:
- `docker run --rm --entrypoint sh ghcr.io/data-fair/data-fair:6 -c 'node --version && which wget curl'`: node ≥ 22 is needed for the `fetch` healthchecks.
- `docker run --rm --entrypoint sh maildev/maildev:2.2.1 -c 'which wget'`: if wget is missing, use `['CMD', 'node', '-e', "fetch('http://127.0.0.1:1080/mails/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]`.
- In `~/data-fair/data-fair`, grep whether `WS_PUBLIC_URL` has a default derived from `PUBLIC_URL`: `grep -n wsPublicUrl api/config/default.cjs`. If it doesn't, add `WS_PUBLIC_URL: ${BASE_URL}/data-fair` with the scheme replaced (`ws://` locally) to `x-data-fair-env`.
- In `~/data-fair/data-fair`, check whether the worker exposes something to probe: `grep -rn "MODE\|mode ===" api/src/server.ts | head`. The worker healthcheck above always succeeds as long as node runs. If the worker has a ping or observer port, use it instead.
- In `~/data-fair/openapi-viewer`, confirm the `ALLOWED_URLS` format: `grep -n allowedUrls -A5 api/config/default.cjs`. Match its shape (object vs array).

- [ ] **Step 9: Run the validation**

Run: `npm run validate -- local`
Expected: all containers healthy; `core.spec.ts` 4 passed; exit 0; report written; `validated-versions.json` and the README block updated.
If a test fails: read the report's logs section, fix the compose file or nginx config, and re-run. Iterate until green. Don't weaken a test to make it pass. If a test's assumption about an endpoint is wrong, confirm the right endpoint in the service repo (e.g. `grep -rn "router.get" ~/data-fair/<service>/api/src`) and fix the test.

- [ ] **Step 10: Commit.** Leave `validated-versions.json` unstaged in Tasks 5–8; Task 12 records the first full validation.

```bash
git add recipes/local test/smoke README.md
git commit -m "feat(recipes): local recipe with core services and smoke tests"
```

---

### Task 6: Portals in the local recipe

**Files:**
- Modify: `recipes/local/compose.yaml`
- Create: `test/smoke/portals.spec.ts`

**Interfaces:**
- Consumes: `loginSuperadmin` (Task 5), compose anchors `*healthcheck` (Task 5).
- Produces: compose services `portals-manager` and `portal`, portal hosts `{id}.portal.<domain>`.

- [ ] **Step 1: Write `test/smoke/portals.spec.ts`**

Node's resolver may not resolve `*.localhost`, so the portal is requested at `localhost` with a `Host` header (browsers resolve `*.localhost` natively).

```ts
import { test, expect } from '@playwright/test'
import { loginSuperadmin } from './support.ts'

test('the portals manager answers', async ({ request }) => {
  const res = await request.get('/portals-manager/api/ping')
  expect(res.status()).toBe(200)
})

test('create a portal and open it on its subdomain', async ({ request, baseURL }) => {
  await loginSuperadmin(request)
  const res = await request.post('/portals-manager/api/portals', { data: { config: { title: 'Smoke portal' } } })
  expect(res.status(), await res.text()).toBeLessThan(300)
  const portal = await res.json()
  const host = `${portal._id}.portal.${new URL(baseURL!).hostname}`
  const page = await request.get('/', { headers: { host } })
  expect(page.status(), await page.text()).toBe(200)
  expect(await page.text()).toContain('Smoke portal')
})
```

- [ ] **Step 2: Run, expect the portals tests to FAIL** (502 from nginx)

Run: `npm run validate -- local`

- [ ] **Step 3: Add the portals services to `recipes/local/compose.yaml`** (before `maildev`)

```yaml
  portals-manager:
    image: ghcr.io/data-fair/portals/manager:2
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    environment:
      MONGO_URL: mongodb://mongo:27017/portals
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      PRIVATE_EVENTS_URL: http://events:8080
      PORTAL_URL_PATTERN: http://{subdomain}.portal.localhost
      SECRET_IDENTITIES: ${SECRET}
      SECRET_EVENTS: ${SECRET}
      SECRET_SITES: ${SECRET}
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  portal:
    image: ghcr.io/data-fair/portals/portal:2
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    environment:
      NUXT_MONGO_URL: mongodb://mongo:27017/portals
      NUXT_PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      NUXT_PORTAL_URL_PATTERN: http://{subdomain}.portal.localhost
      NUXT_MAIN_PUBLIC_URL: ${BASE_URL}
      PORT: '8080'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
```

- [ ] **Step 4: Check the assumptions**
- The portal image's port: `docker run --rm --entrypoint sh ghcr.io/data-fair/portals/portal:2 -c 'env | grep -i port; cat package.json 2>/dev/null | head -20'`. Nuxt uses `PORT`/`NITRO_PORT`; keep whichever the image honors.
- Whether the manager needs `PUBLIC_URL` or `DATA_FAIR_URL`: `grep -n "Url\b\|URL" ~/data-fair/portals/api/config/default.* | head -20`. Add any required URL variable.
- Whether data-fair must know about portals for its menu: `grep -rn privatePortalsManagerUrl ~/data-fair/data-fair/api/src | head -3` (already set in Task 5).

- [ ] **Step 5: Run the validation, expect all smoke tests to PASS**

Run: `npm run validate -- local`

- [ ] **Step 6: Commit**

```bash
git add recipes/local test/smoke/portals.spec.ts
git commit -m "feat(recipes): portals in the local recipe"
```

---

### Task 7: Production recipe (core, portals, metrics, TLS) and its test override

**Files:**
- Create:
  - `recipes/production/compose.yaml`
  - `recipes/production/.env.example`
  - `recipes/production/nginx/{http.conf, proxy.conf, locations.conf, portal-locations.conf, bonus-locations.conf, site.conf.template}`
  - `test/production.override.yaml`
  - `test/production/site.conf.template`
  - `test/smoke/metrics.spec.ts`

**Interfaces:**
- Consumes: the services from Tasks 5 and 6 (same compose service names and env), `testEnvOverrides('production')` (Task 3, sets `DOMAIN=localhost`, `BASE_URL=http://localhost`, `MAILS_TRANSPORT` to maildev).
- Produces:
  - nginx include files that the test override reuses unchanged;
  - compose services `metrics`, `metrics-daemon`;
  - the named volume `nginx-log-socket`;
  - `bonus-locations.conf`, included by the main server (it returns 502 while the bonus services are absent).

- [ ] **Step 1: Write `test/smoke/metrics.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'
import { loginSuperadmin, createDataset, variant } from './support.ts'

test.skip(variant === 'local', 'metrics are only part of the production recipe')

test('nginx logs reach the metrics daemon', async ({ request }) => {
  await loginSuperadmin(request)
  const id = await createDataset(request, 'Metrics smoke')
  for (let i = 0; i < 5; i++) await request.get(`/data-fair/api/v1/datasets/${id}/lines`)
  for (let i = 0; i < 30; i++) {
    const res = await request.get('/metrics/api/daily-api-metrics')
    expect(res.ok(), await res.text()).toBeTruthy()
    if ((await res.json()).count > 0) return
    await sleep(3000)
  }
  throw new Error('no metrics aggregated from nginx logs')
})
```

- [ ] **Step 2: Create `recipes/production/.env.example`**

```bash
# Domain name pointing to this machine. Portals are served on *.portal.<DOMAIN> (see docs/portals.md).
DOMAIN=example.com
BASE_URL=https://example.com

# Replace CHANGE_ME values with long random strings, e.g. the output of: openssl rand -base64 32
SECRET=CHANGE_ME
CIPHER_PASSWORD=CHANGE_ME

# Super administrators (JSON array of emails)
ADMINS=["admin@example.com"]

# Contact address: shown to users, sender of mails, and owner of the letsencrypt certificates
CONTACT_EMAIL=admin@example.com

# SMTP transport, a JSON configuration object for nodemailer, see https://nodemailer.com/smtp
MAILS_TRANSPORT={"host":"smtp.example.com","port":587,"auth":{"user":"CHANGE_ME","pass":"CHANGE_ME"}}

# Certbot DNS plugin for the wildcard portals certificate, see docs/portals.md
CERTBOT_DNS_PLUGIN=dns-ovh
```

`fillEnv` only replaces whole values equal to `CHANGE_ME`, so the placeholders inside the `MAILS_TRANSPORT` JSON stay as they are for the user to edit. The test overrides replace `MAILS_TRANSPORT` anyway.

- [ ] **Step 3: Create the nginx files**

`recipes/production/nginx/proxy.conf`: a verbatim copy of `recipes/local/proxy.conf`, plus these lines at the end:
```nginx
# reverse proxy cache, respecting the cache-control headers of the services
proxy_cache data-fair-cache;
proxy_cache_revalidate on;
proxy_cache_lock on;
proxy_cache_use_stale error timeout http_500 http_502 http_503 http_504;
proxy_cache_convert_head off;
add_header X-Cache-Status $upstream_cache_status;
proxy_cache_bypass $http_x_cache_bypass;
proxy_cache_bypass $cookie_cache_bypass;

# usage metrics, sent to the metrics daemon through a unix socket
access_log syslog:server=unix:/var/run/nginx-log/metrics.log.sock,tag=df,nohostname metrics if=$upstream_http_x_operation;
access_log /var/log/nginx/access.log;
```

`recipes/production/nginx/http.conf` (http context, mounted in `conf.d`):
```nginx
proxy_cache_path /var/cache/nginx/data-fair levels=1:2 keys_zone=data-fair-cache:10m inactive=10d max_size=10g;
proxy_cache_key $scheme$host$request_uri;

map $http_referer $reqref {
  default $http_referer;
  '' '';
}
log_format metrics escape=json '["$host","$reqref",$request_time,$bytes_sent,$status,"$upstream_http_x_owner","$cookie_id_token","$cookie_id_token_org","$http_x_apikey","$http_x_account","$http_x_processing","$upstream_cache_status","$upstream_http_x_resource","$upstream_http_x_operation","$gzip_ratio"]';
```

Compare the `map` and `log_format` with `~/data-fair/metrics/dev/resources/nginx.conf`, and copy the exact current version from there.

`recipes/production/nginx/locations.conf` (main domain):
```nginx
location = / { return 302 /data-fair/; }
location /data-fair/ { set $upstream http://data-fair:8080; proxy_pass $upstream; }
location /simple-directory/ { set $upstream http://simple-directory:8080; proxy_pass $upstream; }
location /events/ { set $upstream http://events:8080; proxy_pass $upstream; }
location /openapi-viewer/ { set $upstream http://openapi-viewer:8080; proxy_pass $upstream; }
location /capture/ { set $upstream http://capture:8080; proxy_pass $upstream; }
location /portals-manager/ { set $upstream http://portals-manager:8080; proxy_pass $upstream; }
location /metrics/ { set $upstream http://metrics:8080; proxy_pass $upstream; }
include /etc/nginx/includes/bonus-locations.conf;
```

`recipes/production/nginx/bonus-locations.conf`:
```nginx
# bonus services (compose.bonus.yaml), these answer 502 while the bonus services are not started
location /registry/ { set $upstream http://registry:8080; proxy_pass $upstream; }
location /processings/ { set $upstream http://processings:8080; proxy_pass $upstream; }
location /catalogs/ { set $upstream http://catalogs:8080; proxy_pass $upstream; }
```

`recipes/production/nginx/portal-locations.conf`:
```nginx
location /data-fair/ { set $upstream http://data-fair:8080; proxy_pass $upstream; }
location /simple-directory/ { set $upstream http://simple-directory:8080; proxy_pass $upstream; }
location /events/ { set $upstream http://events:8080; proxy_pass $upstream; }
location /openapi-viewer/ { set $upstream http://openapi-viewer:8080; proxy_pass $upstream; }
location /processings/ { set $upstream http://processings:8080; proxy_pass $upstream; }
location / { set $upstream http://portal:8080; proxy_pass $upstream; }
```

`recipes/production/nginx/site.conf.template` (TLS server blocks; `jonasal/nginx-certbot` finds the certificates to request from the `ssl_certificate_key` paths, and a `.dns-<plugin>` suffix in the certificate name selects a DNS authenticator):
```nginx
server {
  listen 443 ssl;
  http2 on;
  server_name ${DOMAIN};
  ssl_certificate /etc/letsencrypt/live/main/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/main/privkey.pem;
  ssl_trusted_certificate /etc/letsencrypt/live/main/chain.pem;

  include /etc/nginx/includes/proxy.conf;
  include /etc/nginx/includes/locations.conf;
}

server {
  listen 443 ssl;
  http2 on;
  server_name *.portal.${DOMAIN};
  ssl_certificate /etc/letsencrypt/live/portals.${CERTBOT_DNS_PLUGIN}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/portals.${CERTBOT_DNS_PLUGIN}/privkey.pem;
  ssl_trusted_certificate /etc/letsencrypt/live/portals.${CERTBOT_DNS_PLUGIN}/chain.pem;

  include /etc/nginx/includes/proxy.conf;
  include /etc/nginx/includes/portal-locations.conf;
}
```

- [ ] **Step 4: Check the nginx-certbot conventions** against https://github.com/JonasAlfredsson/docker-nginx-certbot (README, `docs/certbot_authenticators.md`, `docs/advanced_usage.md`):
- the current major tag (plan assumes `6-alpine`);
- that `/etc/nginx/templates` envsubst works and where its output goes (`NGINX_ENVSUBST_OUTPUT_DIR` should be `/etc/nginx/user_conf.d`);
- the certificate-name suffix convention for DNS authenticators, and where the credentials file must be mounted (e.g. `/etc/letsencrypt/ovh.ini`);
- that a wildcard `server_name *.portal...` is requested as `*.portal.<domain>`.

Adjust `site.conf.template` and the compose `nginx` service to match. Write down each convention you relied on in `docs/portals.md` (Task 11).

- [ ] **Step 5: Create `recipes/production/compose.yaml`**

Start from `recipes/local/compose.yaml` (Tasks 5 and 6) and apply exactly these changes:
- Header comment: `# Data Fair – production recipe`.
- Remove the `maildev` service.
- `simple-directory`:
  - `MAILS_TRANSPORT: ${MAILS_TRANSPORT}`
  - `MAILS_FROM: ${CONTACT_EMAIL}`
  - `CONTACT: ${CONTACT_EMAIL}`
  - `MAILDEV_ACTIVE: 'false'`
  - remove `MAILDEV_URL`
- `x-data-fair-env`: add `REVERSE_PROXY_CACHE: 'true'` and `PRIVATE_METRICS_URL: http://metrics:8080`.
- `portals-manager` and `portal`: use `https://{subdomain}.portal.${DOMAIN}` for the pattern variables.
- Replace the `nginx` service with:

```yaml
  nginx:
    image: jonasal/nginx-certbot:6-alpine
    restart: unless-stopped
    ports:
      - 80:80
      - 443:443
    volumes:
      - ./nginx/site.conf.template:/etc/nginx/templates/site.conf.template:ro
      - ./nginx/http.conf:/etc/nginx/conf.d/data-fair-http.conf:ro
      - ./nginx/proxy.conf:/etc/nginx/includes/proxy.conf:ro
      - ./nginx/locations.conf:/etc/nginx/includes/locations.conf:ro
      - ./nginx/portal-locations.conf:/etc/nginx/includes/portal-locations.conf:ro
      - ./nginx/bonus-locations.conf:/etc/nginx/includes/bonus-locations.conf:ro
      - ./certbot-dns.ini:/etc/letsencrypt/${CERTBOT_DNS_PLUGIN}.ini:ro
      - nginx-letsencrypt:/etc/letsencrypt
      - nginx-cache:/var/cache/nginx/data-fair
      - nginx-log-socket:/var/run/nginx-log
    environment:
      CERTBOT_EMAIL: ${CONTACT_EMAIL}
      DOMAIN: ${DOMAIN}
      CERTBOT_DNS_PLUGIN: ${CERTBOT_DNS_PLUGIN}
      NGINX_ENVSUBST_OUTPUT_DIR: /etc/nginx/user_conf.d
    depends_on: { metrics-daemon: { condition: service_healthy } }
    healthcheck:
      <<: *healthcheck
      test: ['CMD-SHELL', 'nginx -t 2>/dev/null && wget -q -O /dev/null --no-check-certificate https://127.0.0.1/data-fair/api/v1/ping --header "Host: $$DOMAIN" || exit 1']
```

- Add the metrics services:

```yaml
  metrics:
    image: ghcr.io/data-fair/metrics:2
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    environment:
      MONGO_URL: mongodb://mongo:27017/metrics
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      PROMETHEUS_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/admin/info').then(r => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]

  metrics-daemon:
    image: ghcr.io/data-fair/metrics/daemon:2
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - nginx-log-socket:/var/run/nginx-log
    environment:
      MONGO_URL: mongodb://mongo:27017/metrics
      SOCKET_PATH: /var/run/nginx-log/metrics.log.sock
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'test', '-S', '/var/run/nginx-log/metrics.log.sock']
```

- Volumes: add `nginx-letsencrypt:`, `nginx-cache:` and `nginx-log-socket:`.

Check with `grep -n "socketPath\|uid\|user" ~/data-fair/metrics/daemon/src/*.ts ~/data-fair/metrics/Dockerfile`. The socket must be writable by the nginx worker user. If the daemon creates it with restrictive permissions, document the fix: e.g. `user: root` on the daemon, or a `chmod` done by the daemon if it is configurable.

- [ ] **Step 6: Create the test override**

`test/production/site.conf.template`:
```nginx
# test only: same includes as production, served over http on localhost
server {
  listen 80 default_server;
  server_name ${DOMAIN};
  include /etc/nginx/includes/proxy.conf;
  include /etc/nginx/includes/locations.conf;
  location /mails/ { set $upstream http://maildev:1080; proxy_pass $upstream; }
}
server {
  listen 80;
  server_name ~^.+\.portal\.localhost$;
  include /etc/nginx/includes/proxy.conf;
  include /etc/nginx/includes/portal-locations.conf;
}
```

`test/production.override.yaml` (the paths are relative to `recipes/production`, the first compose file's directory):
```yaml
# test only: run the production recipe on http://localhost without certificates and with maildev
services:
  nginx:
    image: nginx:1.29-alpine
    ports: !override
      - 80:80
    volumes: !override
      - ../../test/production/site.conf.template:/etc/nginx/templates/site.conf.template:ro
      - ./nginx/http.conf:/etc/nginx/conf.d/data-fair-http.conf:ro
      - ./nginx/proxy.conf:/etc/nginx/includes/proxy.conf:ro
      - ./nginx/locations.conf:/etc/nginx/includes/locations.conf:ro
      - ./nginx/portal-locations.conf:/etc/nginx/includes/portal-locations.conf:ro
      - ./nginx/bonus-locations.conf:/etc/nginx/includes/bonus-locations.conf:ro
      - nginx-cache:/var/cache/nginx/data-fair
      - nginx-log-socket:/var/run/nginx-log
    environment: !override
      DOMAIN: ${DOMAIN}
    healthcheck:
      test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1/data-fair/api/v1/ping']
  simple-directory:
    environment:
      MAILDEV_ACTIVE: 'true'
      MAILDEV_URL: ${BASE_URL}/mails/
  portals-manager:
    environment:
      PORTAL_URL_PATTERN: http://{subdomain}.portal.localhost
  portal:
    environment:
      NUXT_PORTAL_URL_PATTERN: http://{subdomain}.portal.localhost
  maildev:
    image: maildev/maildev:2.2.1
    environment:
      MAILDEV_BASE_PATHNAME: /mails
    healthcheck:
      test: ['CMD', 'wget', '-q', '--spider', 'http://127.0.0.1:1080/mails/healthz']
      interval: 10s
```

`validate.ts` doesn't create `certbot-dns.ini`, and the override's `volumes: !override` removes that mount, so nothing more is needed. Check with `docker compose version` that `!override` is supported (Compose ≥ 2.24).

- [ ] **Step 7: Run lint, then validation**

Run: `npm run lint`
Expected: compose config passes for local, production, and production (test).

Run: `npm run validate -- production`
Expected: all healthy; core, portals and metrics specs pass. Iterate on failures as in Task 5 Step 9.

- [ ] **Step 8: Commit**

```bash
git add recipes/production test/production test/production.override.yaml test/smoke/metrics.spec.ts
git commit -m "feat(recipes): production recipe with TLS, cache, portals and metrics"
```

---

### Task 8: Bonus overlay (registry, processings, catalogs)

**Files:**
- Create: `recipes/production/compose.bonus.yaml`, `test/smoke/bonus.spec.ts`

**Interfaces:**
- Consumes: `bonus-locations.conf` (Task 7), `variant`, `loginSuperadmin` (Task 5).
- Produces: compose services `registry`, `processings`, `processings-worker`, `catalogs`, `catalogs-worker`, and the `.env` variables `DATA_FAIR_API_KEY` and `KOUMOUL_REGISTRY_API_KEY` (optional).

- [ ] **Step 1: Write `test/smoke/bonus.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { loginSuperadmin, variant } from './support.ts'

test.describe('without the bonus overlay', () => {
  test.skip(variant !== 'production', 'only checked on the plain production recipe')
  test('bonus routes answer 502 but nginx keeps serving', async ({ request }) => {
    expect((await request.get('/processings/api/v1/_ping')).status()).toBe(502)
    expect((await request.get('/data-fair/api/v1/ping')).status()).toBe(200)
  })
})

test.describe('with the bonus overlay', () => {
  test.skip(variant !== 'production+bonus', 'bonus overlay not enabled')

  test('bonus services answer through nginx', async ({ request }) => {
    for (const path of ['/registry/api/ping', '/processings/api/v1/_ping', '/catalogs/api/ping']) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })

  test('superadmin can list processings and catalogs', async ({ request }) => {
    await loginSuperadmin(request)
    for (const path of ['/processings/api/v1/processings', '/catalogs/api/catalogs']) {
      const res = await request.get(path)
      expect(res.status(), `${path}: ${await res.text()}`).toBe(200)
    }
  })

  test('plugins can be mirrored from the Koumoul registry', async () => {
    test.skip(!process.env.KOUMOUL_REGISTRY_API_KEY, 'KOUMOUL_REGISTRY_API_KEY not set')
    // the mirroring procedure is documented in docs/bonus-services.md; this test follows it through the registry API
    throw new Error('write this test while writing docs/bonus-services.md (Task 11), following the documented steps')
  })
})
```

The last test is deliberately red when a key is present, until Task 11 writes it. Task 11 lists it as a step.

- [ ] **Step 2: Run, expect FAIL**

Run: `npm run validate -- production --bonus`
Expected: fails because `compose.bonus.yaml` is missing.

- [ ] **Step 3: Check the env names** in the repos before writing the overlay:
- `cat ~/data-fair/registry/api/config/custom-environment-variables.cjs`
- `cat ~/data-fair/processings/api/config/custom-environment-variables.cjs ~/data-fair/processings/worker/config/custom-environment-variables.cjs`
- `cat ~/data-fair/catalogs/api/config/custom-environment-variables.cjs ~/data-fair/catalogs/worker/config/custom-environment-variables.cjs`
- `grep -n "SECRET_INTERNAL_SERVICES\|x-secret-key" -r ~/data-fair/registry/api/src | head`: confirm that processings/catalogs `SECRET_REGISTRY` must equal registry `SECRET_INTERNAL_SERVICES`.
- In `~/data-fair/processings/docker-compose.yml` and `~/data-fair/catalogs/docker-compose.yml`, check the worker image names and the shared volume paths.

- [ ] **Step 4: Create `recipes/production/compose.bonus.yaml`**

```yaml
# Data Fair – bonus services: plugin registry, processings, catalogs
# usage: docker compose -f compose.yaml -f compose.bonus.yaml up -d
# see docs/bonus-services.md, the full plugins registry requires a koumoul.com subscription

x-healthcheck: &healthcheck
  interval: 10s
  timeout: 5s
  retries: 30
  start_period: 20s

x-bonus-env: &bonus-env
  PRIVATE_DIRECTORY_URL: http://simple-directory:8080
  PRIVATE_EVENTS_URL: http://events:8080
  PRIVATE_REGISTRY_URL: http://registry:8080
  CIPHER_PASSWORD: ${CIPHER_PASSWORD}
  SECRET_EVENTS: ${SECRET}
  SECRET_IDENTITIES: ${SECRET}
  SECRET_REGISTRY: ${SECRET}
  OBSERVER_ACTIVE: 'false'

services:

  data-fair:
    environment:
      PRIVATE_PROCESSINGS_URL: http://processings:8080
      PRIVATE_CATALOGS_URL: http://catalogs:8080
      PRIVATE_REGISTRY_URL: http://registry:8080
      SECRET_CATALOGS: ${SECRET}
      SECRET_REGISTRY: ${SECRET}
  data-fair-worker:
    environment:
      PRIVATE_PROCESSINGS_URL: http://processings:8080
      PRIVATE_CATALOGS_URL: http://catalogs:8080
      PRIVATE_REGISTRY_URL: http://registry:8080
      SECRET_CATALOGS: ${SECRET}
      SECRET_REGISTRY: ${SECRET}

  simple-directory:
    environment:
      IDENTITIES_WEBHOOKS: '[{"base":"http://data-fair:8080/api/v1/identities","key":"${SECRET}"},{"base":"http://events:8080/api/identities","key":"${SECRET}"},{"base":"http://portals-manager:8080/api/identities","key":"${SECRET}"},{"base":"http://processings:8080/api/identities","key":"${SECRET}"},{"base":"http://catalogs:8080/api/identities","key":"${SECRET}"}]'

  registry:
    image: ghcr.io/data-fair/registry:0.6
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - registry-data:/data
    environment:
      MONGO_URL: mongodb://mongo:27017/registry
      PRIVATE_DIRECTORY_URL: http://simple-directory:8080
      PRIVATE_EVENTS_URL: http://events:8080
      SECRET_EVENTS: ${SECRET}
      SECRET_INTERNAL_SERVICES: ${SECRET}
      API_KEYS_SALT: ${SECRET}
      CIPHER_PASSWORD: ${CIPHER_PASSWORD}
      OBSERVER_ACTIVE: 'false'
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  processings:
    image: ghcr.io/data-fair/processings:6
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - processings-data:/data
    environment:
      <<: *bonus-env
      MONGO_URL: mongodb://mongo:27017/processings
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/v1/_ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  processings-worker:
    image: ghcr.io/data-fair/processings/worker:6
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - processings-data:/data
    environment:
      <<: *bonus-env
      MONGO_URL: mongodb://mongo:27017/processings
      DATA_FAIR_URL: ${BASE_URL}/data-fair
      PRIVATE_DATA_FAIR_URL: http://data-fair:8080
      DATA_FAIR_API_KEY: ${DATA_FAIR_API_KEY}
      DATA_FAIR_ADMIN_MODE: 'true'
      MAILS_TRANSPORT: ${MAILS_TRANSPORT}
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', 'process.exit(0)']

  catalogs:
    image: ghcr.io/data-fair/catalogs:1
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - catalogs-data:/data
    environment:
      <<: *bonus-env
      MONGO_URL: mongodb://mongo:27017/catalogs
      SECRET_CATALOGS: ${SECRET}
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', "fetch('http://localhost:8080/api/ping').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

  catalogs-worker:
    image: ghcr.io/data-fair/catalogs/worker:1
    restart: unless-stopped
    depends_on: { mongo: { condition: service_healthy } }
    volumes:
      - catalogs-data:/data
    environment:
      <<: *bonus-env
      MONGO_URL: mongodb://mongo:27017/catalogs
      PRIVATE_DATA_FAIR_URL: http://data-fair:8080
      DATA_FAIR_API_KEY: ${DATA_FAIR_API_KEY}
      HOST: ${DOMAIN}
    healthcheck:
      <<: *healthcheck
      test: ['CMD', 'node', '-e', 'process.exit(0)']

volumes:
  registry-data:
  processings-data:
  catalogs-data:
```

The registry runs as uid 1000. If the fresh named volume isn't writable (you'll see errors in the logs), add a one-shot `registry-init` service (`image: busybox`, `command: chown -R 1000:1000 /data`, same volume, `restart: 'no'`) and make `registry` depend on it with `condition: service_completed_successfully`. Give it no healthcheck: `notReady` treats exited one-shot containers as not ready, so in that case also change `notReady` to ignore services with state `exited` and exit code 0. That means adding `exitCode` to `ContainerState` (parsed from `ExitCode`), with a unit test.

- [ ] **Step 5: Add to `recipes/production/.env.example`**

```bash
# Bonus services only (compose.bonus.yaml), see docs/bonus-services.md
# a super admin API key of data-fair, used by the processings and catalogs workers
DATA_FAIR_API_KEY=
```

In `scripts/lib/recipes.ts`, `testEnvOverrides('production+bonus')` already returns the production overrides. The workers start without a valid key, and the tests don't run processings. Record that as a known limit in the report: add a line `- DATA_FAIR_API_KEY: not provisioned, processings/catalogs workers not exercised` in `validate.ts` when the variant is `production+bonus`.

- [ ] **Step 6: Run the validations**

Run: `npm run lint && npm run validate -- production && npm run validate -- production --bonus`
Expected: both green. With plain production, the "without the bonus overlay" test passes (502 on `/processings`).

- [ ] **Step 7: Commit**

```bash
git add recipes/production test/smoke/bonus.spec.ts scripts
git commit -m "feat(recipes): bonus overlay with registry, processings and catalogs"
```

---

### Task 9: Drift detection library and CLI

**Files:**
- Create: `scripts/lib/versions.ts`, `scripts/lib/registries.ts`, `scripts/lib/drift.ts`, `scripts/check-versions.ts`
- Test: `test/unit/versions.spec.ts`, `test/unit/drift.spec.ts`

**Interfaces:**
- Consumes: `SERVICES`, `Service`, `ValidatedVersions` (Task 4).
- Produces:
  - `parseSemver(v: string): [number, number, number] | null`
  - `latestVersion(tags: string[], sameMajorAs?: string): string | null`
  - `bumpKind(from: string, to: string): 'none' | 'patch' | 'minor' | 'major'`
  - `extractEnvNames(source: string): string[]`
  - `requiredPaths(schema: any, prefix?: string): string[]`
  - `diffSets(a: string[], b: string[]): { added: string[], removed: string[] }`
  - `fetchTags(s: Service): Promise<string[]>`
  - `fetchRepoFile(repo: string, version: string, path: string): Promise<string | null>`
  - `type Finding = { service: string, level: 'action' | 'info', message: string, details?: string[] }`
  - `computeFindings(input: { validated: ValidatedVersions | null, latest: Record<string, string | null>, fileDiffs: Record<string, FileDiff[]> }): Finding[]`
  - `type FileDiff = { path: string, missing: boolean, envAdded: string[], envRemoved: string[], requiredAdded: string[] }`
  - `renderReport(findings: Finding[]): string`
  - CLI: `npm run check-versions [-- --github-issue]` exits 0 even when there are findings (the issue is the signal), and exits 1 only on unexpected errors.

- [ ] **Step 1: Write failing tests**

`test/unit/versions.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { parseSemver, latestVersion, bumpKind, extractEnvNames, requiredPaths, diffSets } from '../../scripts/lib/versions.ts'

test('parseSemver', () => {
  expect(parseSemver('6.20.0')).toEqual([6, 20, 0])
  expect(parseSemver('v6.20.0')).toEqual([6, 20, 0])
  expect(parseSemver('6')).toBeNull()
  expect(parseSemver('master')).toBeNull()
  expect(parseSemver('6.20.0-beta.1')).toBeNull()
})

test('latestVersion ignores non semver tags and can stay in a major', () => {
  const tags = ['6', 'master', '6.9.0', '6.20.0', '7.0.0', '8.0.17', 'latest']
  expect(latestVersion(tags)).toBe('8.0.17')
  expect(latestVersion(tags, '6.1.0')).toBe('6.20.0')
  expect(latestVersion(['main'])).toBeNull()
})

test('bumpKind', () => {
  expect(bumpKind('6.1.0', '6.1.0')).toBe('none')
  expect(bumpKind('6.1.0', '6.1.3')).toBe('patch')
  expect(bumpKind('6.1.0', '6.2.0')).toBe('minor')
  expect(bumpKind('6.1.0', '7.0.0')).toBe('major')
})

test('extractEnvNames reads custom-environment-variables files in any format', () => {
  const cjs = "module.exports = { port: 'PORT', a: { __name: 'A_JSON', __format: 'json' }, b: jsonEnv('B_LIST') }"
  expect(extractEnvNames(cjs)).toEqual(['A_JSON', 'B_LIST', 'PORT'])
  const nuxt = "runtimeConfig: { mongoUrl: 'x', portalUrlPattern: '' }"
  expect(extractEnvNames(nuxt)).toEqual(['NUXT_MONGO_URL', 'NUXT_PORTAL_URL_PATTERN'])
})

test('requiredPaths walks nested properties', () => {
  const schema = { required: ['a', 'b'], properties: { b: { type: 'object', required: ['c'], properties: { c: {} } } } }
  expect(requiredPaths(schema)).toEqual(['a', 'b', 'b.c'])
})

test('diffSets', () => {
  expect(diffSets(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'] })
})
```

`extractEnvNames` handles two cases:
- a `custom-environment-variables` file: all quoted UPPER_CASE strings;
- a `nuxt.config.ts` file: the keys of the `runtimeConfig` block, converted to `NUXT_` + SCREAMING_SNAKE.

Detect the nuxt case by the presence of `runtimeConfig:`.

`test/unit/drift.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import { computeFindings, renderReport } from '../../scripts/lib/drift.ts'

const validated = { date: '2026-09-01', runs: { local: '2026-09-01' }, versions: { 'data-fair': '6.20.0', mongo: '8.0.17', events: '1.4.1' } }

test('no validation yet is an action', () => {
  const f = computeFindings({ validated: null, latest: {}, fileDiffs: {} })
  expect(f).toEqual([{ service: '*', level: 'action', message: 'no validated-versions.json yet, run npm run validate' }])
})

test('major bump is an action, minor with only added env is info', () => {
  const f = computeFindings({
    validated,
    latest: { 'data-fair': '7.0.0', events: '1.5.0', mongo: '8.0.17' },
    fileDiffs: { events: [{ path: 'api/config/custom-environment-variables.cjs', missing: false, envAdded: ['NEW_OPT'], envRemoved: [], requiredAdded: [] }] }
  })
  expect(f.find(x => x.service === 'data-fair')?.level).toBe('action')
  const ev = f.find(x => x.service === 'events')
  expect(ev?.level).toBe('info')
  expect(ev?.details?.join('\n')).toContain('NEW_OPT')
  expect(f.find(x => x.service === 'mongo')).toBeUndefined()
})

test('removed env, newly required config or missing file are actions', () => {
  const f = computeFindings({
    validated,
    latest: { events: '1.4.2', 'data-fair': '6.21.0' },
    fileDiffs: {
      events: [{ path: 'x', missing: false, envAdded: [], envRemoved: ['OLD'], requiredAdded: [] }],
      'data-fair': [{ path: 'api/config/type/schema.json', missing: true, envAdded: [], envRemoved: [], requiredAdded: [] }]
    }
  })
  expect(f.filter(x => x.level === 'action').map(x => x.service).sort()).toEqual(['data-fair', 'events'])
})

test('minor bump of mongo is an action, patch is info', () => {
  expect(computeFindings({ validated, latest: { mongo: '8.2.0' }, fileDiffs: {} })[0].level).toBe('action')
  expect(computeFindings({ validated, latest: { mongo: '8.0.18' }, fileDiffs: {} })[0].level).toBe('info')
})

test('a service never validated is an action', () => {
  const f = computeFindings({ validated, latest: { metrics: '2.5.0' }, fileDiffs: {} })
  expect(f[0]).toMatchObject({ service: 'metrics', level: 'action' })
})

test('renderReport puts actions first and says when all is in sync', () => {
  const md = renderReport([
    { service: 'events', level: 'info', message: 'i' },
    { service: 'data-fair', level: 'action', message: 'a' }
  ])
  expect(md.indexOf('Action needed')).toBeLessThan(md.indexOf('For information'))
  expect(renderReport([])).toContain('in sync')
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/versions.ts`**

```ts
export function parseSemver (v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function latestVersion (tags: string[], sameMajorAs?: string): string | null {
  const major = sameMajorAs ? parseSemver(sameMajorAs)?.[0] : undefined
  const parsed = tags
    .map(t => ({ t: t.replace(/^v/, ''), v: parseSemver(t) }))
    .filter((x): x is { t: string, v: [number, number, number] } => !!x.v && (major === undefined || x.v[0] === major))
    .sort((a, b) => cmp(b.v, a.v))
  return parsed[0]?.t ?? null
}

export function bumpKind (from: string, to: string): 'none' | 'patch' | 'minor' | 'major' {
  const a = parseSemver(from)
  const b = parseSemver(to)
  if (!a || !b || cmp(a, b) >= 0) return 'none'
  if (b[0] !== a[0]) return 'major'
  if (b[1] !== a[1]) return 'minor'
  return 'patch'
}

const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export function extractEnvNames (source: string): string[] {
  const names = new Set<string>()
  // nuxt: the runtimeConfig block is flat, keys become NUXT_SCREAMING_SNAKE env vars
  const runtime = source.match(/runtimeConfig:\s*\{([\s\S]*?)\}/)
  if (runtime) {
    for (const m of runtime[1].matchAll(/(\w+)\s*:/g)) names.add('NUXT_' + snake(m[1]))
  } else {
    for (const m of source.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)) names.add(m[1])
  }
  return [...names].sort()
}

export function requiredPaths (schema: any, prefix = ''): string[] {
  if (!schema || typeof schema !== 'object') return []
  const out: string[] = []
  for (const key of schema.required ?? []) {
    const path = prefix ? `${prefix}.${key}` : key
    out.push(path)
    out.push(...requiredPaths(schema.properties?.[key], path))
  }
  return out
}

export function diffSets (a: string[], b: string[]): { added: string[], removed: string[] } {
  const sa = new Set(a)
  const sb = new Set(b)
  return { added: b.filter(x => !sa.has(x)), removed: a.filter(x => !sb.has(x)) }
}
```

- [ ] **Step 4: Implement `scripts/lib/drift.ts`**

```ts
import type { ValidatedVersions } from './services.ts'
import { SERVICES } from './services.ts'
import { bumpKind } from './versions.ts'

export type FileDiff = { path: string, missing: boolean, envAdded: string[], envRemoved: string[], requiredAdded: string[] }
export type Finding = { service: string, level: 'action' | 'info', message: string, details?: string[] }

export function computeFindings (input: { validated: ValidatedVersions | null, latest: Record<string, string | null>, fileDiffs: Record<string, FileDiff[]> }): Finding[] {
  if (!input.validated) return [{ service: '*', level: 'action', message: 'no validated-versions.json yet, run npm run validate' }]
  const findings: Finding[] = []
  for (const [service, latest] of Object.entries(input.latest)) {
    if (!latest) continue
    const current = input.validated.versions[service]
    if (!current) {
      findings.push({ service, level: 'action', message: `never validated, latest is ${latest}` })
      continue
    }
    const bump = bumpKind(current, latest)
    if (bump === 'none') continue
    const def = SERVICES.find(s => s.key === service)
    const diffs = input.fileDiffs[service] ?? []
    const details: string[] = []
    let action = bump === 'major' || (def?.track === 'minor' && bump === 'minor')
    for (const d of diffs) {
      if (d.missing) { action = true; details.push(`\`${d.path}\` not found at ${latest}, the repo layout changed`) }
      if (d.envRemoved.length) { action = true; details.push(`\`${d.path}\` removed: ${d.envRemoved.join(', ')}`) }
      if (d.requiredAdded.length) { action = true; details.push(`\`${d.path}\` newly required: ${d.requiredAdded.join(', ')}`) }
      if (d.envAdded.length) details.push(`\`${d.path}\` added: ${d.envAdded.join(', ')}`)
    }
    findings.push({ service, level: action ? 'action' : 'info', message: `${bump} update ${current} → ${latest}`, details })
  }
  return findings
}

export function renderReport (findings: Finding[]): string {
  if (!findings.length) return 'All services are in sync with the last validation.\n'
  const section = (title: string, list: Finding[]) => list.length
    ? [`## ${title}`, '', ...list.flatMap(f => [`- **${f.service}**: ${f.message}`, ...(f.details ?? []).map(d => `  - ${d}`)]), '']
    : []
  return [
    ...section('Action needed', findings.filter(f => f.level === 'action')),
    ...section('For information', findings.filter(f => f.level === 'info')),
    'See MAINTENANCE.md for the procedure.', ''
  ].join('\n')
}
```

- [ ] **Step 5: Run the unit tests, expect PASS**

- [ ] **Step 6: Implement `scripts/lib/registries.ts`**

```ts
import type { Service } from './services.ts'

async function ghcrTags (image: string): Promise<string[]> {
  const repo = image.replace(/^ghcr\.io\//, '')
  const { token } = await (await fetch(`https://ghcr.io/token?scope=repository:${repo}:pull`)).json() as { token: string }
  const tags: string[] = []
  let url: string | null = `https://ghcr.io/v2/${repo}/tags/list?n=1000`
  while (url) {
    const res: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`ghcr tags ${repo}: ${res.status}`)
    tags.push(...((await res.json()) as { tags: string[] }).tags)
    const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
    url = next ? new URL(next, 'https://ghcr.io').href : null
  }
  return tags
}

async function dockerHubTags (image: string, prefix: string): Promise<string[]> {
  const name = image.includes('/') ? image : `library/${image}`
  const res = await fetch(`https://hub.docker.com/v2/repositories/${name}/tags?page_size=100&name=${prefix}`)
  if (!res.ok) throw new Error(`docker hub tags ${name}: ${res.status}`)
  return ((await res.json()) as { results: { name: string }[] }).results.map(r => r.name)
}

export const fetchTags = (s: Service, currentVersion?: string): Promise<string[]> =>
  s.registry === 'ghcr' ? ghcrTags(s.image) : dockerHubTags(s.image, (currentVersion ?? '').split('.')[0] + '.')

export async function fetchRepoFile (repo: string, version: string, path: string): Promise<string | null> {
  for (const ref of [`v${version}`, version]) {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${path}`)
    if (res.ok) return res.text()
  }
  return null
}
```

Docker Hub filtering uses the current major as the prefix (e.g. `8.`), so `latestVersion` sees only mongo 8.x tags. That's deliberate: mongo majors are tracked by hand in MAINTENANCE.md.

- [ ] **Step 7: Implement `scripts/check-versions.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SERVICES, type ValidatedVersions } from './lib/services.ts'
import { latestVersion, extractEnvNames, requiredPaths, diffSets, bumpKind } from './lib/versions.ts'
import { fetchTags, fetchRepoFile } from './lib/registries.ts'
import { computeFindings, renderReport, type FileDiff } from './lib/drift.ts'
import { syncIssue } from './lib/github-issue.ts'

const root = resolve(import.meta.dirname, '..')
const vPath = resolve(root, 'validated-versions.json')
const validated: ValidatedVersions | null = existsSync(vPath) ? JSON.parse(await readFile(vPath, 'utf8')) : null

const latest: Record<string, string | null> = {}
const fileDiffs: Record<string, FileDiff[]> = {}

if (validated) {
  for (const s of SERVICES) {
    const current = validated.versions[s.key]
    const tags = await fetchTags(s, current)
    latest[s.key] = latestVersion(tags, s.registry === 'dockerhub' ? current : undefined)
    const to = latest[s.key]
    if (!current || !to || !s.repo || bumpKind(current, to) === 'none') continue
    fileDiffs[s.key] = []
    for (const path of s.configFiles ?? []) {
      const [before, after] = await Promise.all([fetchRepoFile(s.repo, current, path), fetchRepoFile(s.repo, to, path)])
      if (after === null) { fileDiffs[s.key].push({ path, missing: true, envAdded: [], envRemoved: [], requiredAdded: [] }); continue }
      if (path.endsWith('.json')) {
        const { added } = diffSets(before ? requiredPaths(JSON.parse(before)) : [], requiredPaths(JSON.parse(after)))
        fileDiffs[s.key].push({ path, missing: false, envAdded: [], envRemoved: [], requiredAdded: added })
      } else {
        const { added, removed } = diffSets(before ? extractEnvNames(before) : [], extractEnvNames(after))
        fileDiffs[s.key].push({ path, missing: false, envAdded: added, envRemoved: removed, requiredAdded: [] })
      }
    }
  }
}

const findings = computeFindings({ validated, latest, fileDiffs })
const report = renderReport(findings)
console.log(report)

if (process.argv.includes('--github-issue')) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required with --github-issue')
  await syncIssue({ token, repo, title: 'Install docs drift', body: findings.length ? report : null })
}
```

Write `scripts/lib/github-issue.ts` in Task 10. Until then, run the CLI without `--github-issue` and keep the import commented out. Or do Task 10 Step 3 first. Either order is fine, but eslint must pass at commit time.

- [ ] **Step 8: Run the CLI against the real registries**

Run: `npm run check-versions`
Expected:
- if `validated-versions.json` doesn't exist yet: the "no validated-versions.json yet" action;
- after Task 12: a list or "in sync".

To try a real diff before Task 12, write a throwaway file with older versions, e.g. `{"date":"x","runs":{},"versions":{"events":"1.3.0","mongo":"8.0.1"}}`, run, check that the output is plausible, then delete it.

- [ ] **Step 9: Commit**

```bash
git add scripts test/unit
git commit -m "feat(scripts): version drift detection with config diffs"
```

---

### Task 10: Weekly drift workflow and issue sync

**Files:**
- Create: `scripts/lib/github-issue.ts`, `.github/workflows/drift.yaml`
- Test: `test/unit/github-issue.spec.ts`

**Interfaces:**
- Consumes: `renderReport` output (Task 9).
- Produces: `syncIssue(opts: { token: string, repo: string, title: string, body: string | null, fetchImpl?: typeof fetch }): Promise<'created' | 'updated' | 'closed' | 'noop'>`. The issue is identified by the label `install-drift`.

- [ ] **Step 1: Write the failing test with a fake fetch**

```ts
import { test, expect } from '@playwright/test'
import { syncIssue } from '../../scripts/lib/github-issue.ts'

function fakeFetch (openIssues: any[]) {
  const calls: { method: string, url: string, body?: any }[] = []
  const impl = (async (url: string, init: any = {}) => {
    calls.push({ method: init.method ?? 'GET', url, body: init.body && JSON.parse(init.body) })
    const json = (init.method ?? 'GET') === 'GET' ? openIssues : { number: 1 }
    return new Response(JSON.stringify(json), { status: 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const base = { token: 't', repo: 'data-fair/install', title: 'Install docs drift' }

test('creates the issue when findings and none open', async () => {
  const f = fakeFetch([])
  expect(await syncIssue({ ...base, body: 'report', fetchImpl: f.impl })).toBe('created')
  expect(f.calls[1]).toMatchObject({ method: 'POST', body: { title: 'Install docs drift', body: 'report', labels: ['install-drift'] } })
})

test('updates the open issue', async () => {
  const f = fakeFetch([{ number: 7, body: 'old' }])
  expect(await syncIssue({ ...base, body: 'new', fetchImpl: f.impl })).toBe('updated')
  expect(f.calls[1]).toMatchObject({ method: 'PATCH', body: { body: 'new' } })
  expect(f.calls[1].url).toMatch(/issues\/7$/)
})

test('no update when the body did not change', async () => {
  const f = fakeFetch([{ number: 7, body: 'same' }])
  expect(await syncIssue({ ...base, body: 'same', fetchImpl: f.impl })).toBe('noop')
})

test('closes the open issue when in sync', async () => {
  const f = fakeFetch([{ number: 7, body: 'old' }])
  expect(await syncIssue({ ...base, body: null, fetchImpl: f.impl })).toBe('closed')
  expect(f.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { state: 'closed' } })
})

test('noop when in sync and nothing open', async () => {
  const f = fakeFetch([])
  expect(await syncIssue({ ...base, body: null, fetchImpl: f.impl })).toBe('noop')
})
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/github-issue.ts`**

```ts
const LABEL = 'install-drift'

export async function syncIssue (opts: { token: string, repo: string, title: string, body: string | null, fetchImpl?: typeof fetch }): Promise<'created' | 'updated' | 'closed' | 'noop'> {
  const f = opts.fetchImpl ?? fetch
  const api = `https://api.github.com/repos/${opts.repo}/issues`
  const headers = { authorization: `Bearer ${opts.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' }
  const call = async (url: string, method = 'GET', body?: unknown) => {
    const res = await f(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!res.ok) throw new Error(`GitHub API ${method} ${url}: ${res.status} ${await res.text()}`)
    return res.json()
  }
  const open: { number: number, body: string }[] = await call(`${api}?state=open&labels=${LABEL}`)
  const existing = open[0]
  if (opts.body === null) {
    if (!existing) return 'noop'
    await call(`${api}/${existing.number}/comments`, 'POST', { body: 'All services are in sync with the last validation, closing.' })
    await call(`${api}/${existing.number}`, 'PATCH', { state: 'closed' })
    return 'closed'
  }
  if (!existing) {
    await call(api, 'POST', { title: opts.title, body: opts.body, labels: [LABEL] })
    return 'created'
  }
  if (existing.body === opts.body) return 'noop'
  await call(`${api}/${existing.number}`, 'PATCH', { body: opts.body })
  return 'updated'
}
```

- [ ] **Step 4: Run tests, expect PASS.** Re-enable the `syncIssue` import in `check-versions.ts` if you commented it out.

- [ ] **Step 5: Create `.github/workflows/drift.yaml`**

```yaml
name: Install docs drift

on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Lint recipes, links and scripts
        run: npm run lint
      - name: Check versions and sync the drift issue
        if: always()
        run: npm run check-versions -- --github-issue
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
```

The `install-drift` label must exist. GitHub creates missing labels on issue creation when the token has `issues: write`; if it doesn't, create the label once by hand. Note that in MAINTENANCE.md.

- [ ] **Step 6: Run everything locally**

Run: `npm run test-unit && npm run lint && npm run check-versions`
Expected: pass; the report is printed.

- [ ] **Step 7: Commit**

```bash
git add scripts .github test/unit
git commit -m "ci: weekly drift check that keeps an issue in sync"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`
- Create: `recipes/local/README.md`, `recipes/production/README.md`, `docs/portals.md`, `docs/bonus-services.md`, `docs/operations.md`, `docs/upgrading.md`, `MAINTENANCE.md`
- Modify: `test/smoke/bonus.spec.ts` (the mirroring test)

**Interfaces:**
- Consumes: every recipe file (Tasks 5–8), the npm scripts (Tasks 1–10).
- Produces: markdown that `npm run lint` checks for dead links.

Writing rules for every page:
- English; second person; short sections; every command in a fenced block, copy-pastable.
- The commands in the recipe READMEs must be exactly the ones `validate.ts` runs, apart from the test overrides. If you change one, change the other.
- Link to the config schemas at `https://github.com/data-fair/<repo>/blob/main/<path>`, using the paths from `scripts/lib/services.ts`.

- [ ] **Step 1: `README.md`** (keep the `<!-- last-validated -->` block). Sections:
  1. **What this is:** self-hosting Data Fair with Docker Compose. Link to https://datafair.cloud for the product and the architecture, and https://docs.koumoul.com for the user documentation.
  2. **Choose a recipe:** a table with local (try it on your machine, http://localhost, no mails) and production (one VM, a domain, HTTPS, real SMTP, metrics), plus the bonus overlay.
  3. **Requirements:**
     - Linux with Docker Engine and Compose v2 ≥ 2.24.
     - Hardware: local 4 CPU / 8 GB RAM / 20 GB disk; production 4+ CPU / 16 GB RAM / 100 GB SSD, more with the bonus services.
     - `vm.max_map_count=262144` for Elasticsearch, with the `sysctl` command.
  4. **Services:** one line per service with its role and a link to its config schema.
  5. **Last validated:** the block.
  6. **Migrating from the old documentation:** a link to `docs/upgrading.md`.
  7. **Contributing:** a link to `MAINTENANCE.md`.
- [ ] **Step 2: `recipes/local/README.md`:**
  1. Download: `git clone https://github.com/data-fair/install && cd install/recipes/local`, or download the folder.
  2. `cp .env.example .env`, replace the `CHANGE_ME` values (`openssl rand -base64 32`), set `ADMINS`.
  3. `docker compose up -d`, then `docker compose ps` until everything is `healthy`, which can take a few minutes on the first start.
  4. Open http://localhost. On the login page choose "forgot password" with the admin email, open http://localhost/mails/ to get the mail, set the password and log in.
  5. Portals: create one in the portals menu; it's served at `http://<portal id>.portal.localhost`.
  6. Stop with `docker compose down`, reset with `docker compose down -v`.
  7. Troubleshooting: `docker compose logs <service>`, and the `vm.max_map_count` error of Elasticsearch.
- [ ] **Step 3: `recipes/production/README.md`:**
  1. DNS: records for `<domain>` and `*.portal.<domain>` pointing to the VM.
  2. `.env`: every variable explained.
  3. `certbot-dns.ini`: the provider credentials, with a link to `docs/portals.md`.
  4. `docker compose up -d`, `docker compose ps`, `docker compose logs nginx` to follow certificate creation.
  5. First login: the superadmin gets the password reset mail through the real SMTP.
  6. What the recipe adds compared to local: cache, metrics, split worker, TLS. For each, which files and lines are involved, in the style of the old doc.
  7. The bonus services: a link to `docs/bonus-services.md`.
- [ ] **Step 4: `docs/portals.md`:**
  - how portal hosts work (`{id}.portal.<domain>`, `.draft` subdomains for drafts, custom domains through the portal's ingress settings);
  - the DNS records;
  - the wildcard certificate with a DNS challenge in `jonasal/nginx-certbot`: the conventions checked in Task 7 Step 4, with an OVH example and a Cloudflare example of `certbot-dns.ini`;
  - the alternative of bringing your own certificate: mount it and change the `ssl_certificate` paths;
  - adding a custom domain: an extra server block including `portal-locations.conf`.
- [ ] **Step 5: `docs/bonus-services.md`:**
  - what the registry, processings and catalogs are;
  - **they work best with a koumoul.com subscription**, which gives access to the full plugin registry to mirror;
  - how to enable them: `docker compose -f compose.yaml -f compose.bonus.yaml up -d`;
  - creating the data-fair superadmin API key for `DATA_FAIR_API_KEY`;
  - configuring the mirror of the Koumoul registry (read `~/data-fair/registry/docs/architecture.md` and `docs/ci-integration.md` for the exact procedure);
  - publishing your own plugins.

  Then implement the `plugins can be mirrored` test in `test/smoke/bonus.spec.ts` by following the documented procedure step by step through the registry API.
- [ ] **Step 6: `docs/operations.md`:**
  - logs;
  - updating images (`docker compose pull && docker compose up -d`, major tags);
  - where the data lives (named volumes, with the list);
  - backups: `mongodump` in the mongo container, a snapshot of the data-fair volume, ES data that can be rebuilt by re-indexing (check this claim with `grep -rn "reindex" ~/data-fair/data-fair/api/src | head`, and phrase it according to what is really supported);
  - SMTP setup;
  - scaling hints (more `data-fair-worker` replicas, ES memory).
- [ ] **Step 7: `docs/upgrading.md`**, for installs from the old v4 recipes:
  - data-fair 4→6;
  - ES 7.17→8.19, with data kept (ES 8 reads 7.17 indices) or reindexed;
  - Mongo 4.4→8.0, going through each major (5.0, 6.0, 7.0) with `setFeatureCompatibilityVersion`;
  - notify → events;
  - thumbor removed;
  - portals v1 → v2.

  Keep each step factual; where the migration path isn't known for sure, say so and link to the service changelog, rather than invent steps.
- [ ] **Step 8: `MAINTENANCE.md`**, following the spec's "Drift detection and maintenance" section:
  - the weekly workflow and the `install-drift` issue;
  - the step-by-step procedure;
  - the commands;
  - the agent guidance (sources of truth, never copy secrets or hostnames from the infrastructure, never edit `validated-versions.json` by hand, say in the commit message when validation wasn't run);
  - how to add a service: `scripts/lib/services.ts`, recipe, smoke test, docs;
  - mongo majors being tracked by hand.
- [ ] **Step 9: Run** `npm run lint`. Expected: no dead links.
- [ ] **Step 10: Commit**

```bash
git add README.md recipes docs MAINTENANCE.md test/smoke/bonus.spec.ts
git commit -m "docs: installation, portals, bonus services, operations, upgrading and maintenance"
```

---

### Task 12: Full validation and publication

**Files:**
- Modify: `validated-versions.json`, `README.md` (both written by `validate.ts`)

- [ ] **Step 1: Run the three validations in sequence**

Run: `npm run validate -- local && npm run validate -- production && npm run validate -- production --bonus`
Expected: 3 green runs, 3 reports in `test/reports/`, and `validated-versions.json` containing every service in `SERVICES`.

- [ ] **Step 2: Run the drift check**

Run: `npm run check-versions`
Expected: "All services are in sync with the last validation."

- [ ] **Step 3: Commit**

```bash
git add validated-versions.json README.md
git commit -m "chore: first full validation of the recipes"
```

- [ ] **Step 4: Ask the user** before any of these outward-facing actions:
  1. push the `install-docs` branch and open a PR on `data-fair/install`, or merge to main;
  2. after it's merged, run the drift workflow once manually (`gh workflow run drift.yaml`);
  3. push the prepared commit of `data-fair/data-fair.github.io`, which is in the session scratchpad clone, to `main`.
