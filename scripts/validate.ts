import { cp, mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir, freemem, totalmem, release } from 'node:os'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseVariantArgs, recipeDir, composeFiles, testEnvOverrides, mongoKernelWorkaround } from './lib/recipes.ts'
import { fillEnv } from './lib/env.ts'
import { runCompose, waitHealthy, type ComposeProject } from './lib/compose.ts'
import { runTlsCheck } from './lib/tls-check.ts'
import { servicesFor, mergeValidated, shouldRecord, renderLastValidated, type Service, type ValidatedVersions } from './lib/services.ts'

const root = resolve(import.meta.dirname, '..')
const { variant, keep } = parseVariantArgs(process.argv.slice(2))
const date = new Date().toISOString().slice(0, 10)
const report: string[] = [`# Validation ${variant} – ${date}`, '']
const log = (...lines: string[]) => { for (const line of lines) { console.log(line); report.push(line) } }

// 1. prerequisites
const docker = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' })
if (docker.status !== 0) throw new Error('docker compose v2 is required')
const minMemGb = variant === 'local' ? 6 : 10
if (totalmem() / 1e9 < minMemGb) console.warn(`⚠ less than ${minMemGb}GB of total memory, the stack may not fit`)
log(`- free memory at start: ${(freemem() / 1e9).toFixed(1)}GB`)

// 2. copy the recipe to a temp dir, like a user would, and create .env
const example = await readFile(join(recipeDir(variant), '.env.example'), 'utf8')
const work = await mkdtemp(join(tmpdir(), `dfi-${variant.replace('+', '-')}-`))
await cp(resolve(root, 'recipes'), join(work, 'recipes'), { recursive: true })
await cp(resolve(root, 'test'), join(work, 'test'), { recursive: true, filter: src => !src.includes('reports') })
const dir = join(work, 'recipes', variant === 'local' ? 'local' : 'production')
await writeFile(join(dir, '.env'), fillEnv(example, testEnvOverrides(variant)))
const p: ComposeProject = { dir, name: `dfi-${variant.replace('+', '-')}`, files: composeFiles(variant, { test: true }), envFile: '.env' }
log(`- work dir: ${dir}`)
if (variant === 'production+bonus') log('- DATA_FAIR_API_KEY: not provisioned, the processings and catalogs workers are not exercised')
const mongoImage = mongoKernelWorkaround(release())
if (mongoImage) {
  await writeFile(join(dir, 'kernel-workaround.override.yaml'), `services:\n  mongo:\n    image: ${mongoImage}\n`)
  p.files.push('kernel-workaround.override.yaml')
  log(`- kernel ${release()} is affected by https://jira.mongodb.org/browse/SERVER-121912, mongo pinned to ${mongoImage}`)
}

// tear the stack down whatever happens, including an interruption (ctrl+c, kill)
// a single shared promise, so that the main flow and a signal handler both wait for the same teardown
let teardownPromise: Promise<void> | undefined
const teardown = (): Promise<void> => {
  teardownPromise ??= (async () => {
    if (!keep) {
      await runCompose(p, ['down', '-v', '--remove-orphans'], { inherit: true })
      await rm(work, { recursive: true, force: true })
    } else {
      log(`- --keep: stack left running, stop it with: cd ${dir} && docker compose -p ${p.name} --env-file .env ${p.files.map(f => `-f ${f}`).join(' ')} down -v`)
    }
  })()
  return teardownPromise
}
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} received, tearing down`)
    interrupted = true
    teardown().finally(() => process.exit(130))
  })
}

let healthy = false
let smokeCode = 1
let versions: Record<string, string> = {}
try {
  // 3. start, exactly as documented (the README says: docker compose up -d)
  const up = await runCompose(p, ['up', '-d', '--pull', 'always', '--quiet-pull'], { inherit: true })
  if (up.code !== 0) throw new Error('docker compose up failed')
  await waitHealthy(p, 10 * 60_000)
  healthy = true
  log('- all containers healthy')

  // 4. smoke tests
  const env = await readFile(join(dir, '.env'), 'utf8')
  // the public URL as compose resolves it from .env (BASE_URL may reference DOMAIN)
  const resolved = JSON.parse((await runCompose(p, ['config', '--format', 'json'])).stdout)
  const baseUrl: string = resolved.services['data-fair'].environment.PUBLIC_URL.replace(/\/data-fair$/, '')
  const smoke = spawnSync('npx', ['playwright', 'test', '--project', 'smoke'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      SMOKE_BASE_URL: baseUrl,
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
} finally {
  if (!healthy || smokeCode !== 0) {
    const ps = await runCompose(p, ['ps', '--all'])
    const logs = await runCompose(p, ['logs', '--no-color', '--tail', '80'])
    report.push('', '## docker compose ps', '```', ps.stdout, '```', '', '## logs (tail)', '```', logs.stdout, '```')
  }
  await teardown()
}

// 6. production: check the https setup that the http-only validation replaced
let tls: boolean | undefined
if (variant !== 'local' && healthy && smokeCode === 0) tls = await runTlsCheck(log)

if (interrupted) await new Promise(() => {}) // the signal handler exits once the teardown is over
const ok = shouldRecord({ healthy, smokeCode, tls })
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
