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
  if (r.status !== 0) {
    failed = true
    console.error(`✖ ${label}`)
  }
}

for (const variant of VARIANTS) {
  const dir = recipeDir(variant)
  for (const test of [false, true]) {
    const files = composeFiles(variant, { test })
    const label = `compose config ${variant}${test ? ' (test)' : ''}`
    if (!existsSync(resolve(dir, '.env.example')) || !files.every(f => existsSync(resolve(dir, f)))) {
      console.log(`- skip ${label}: files missing`)
      continue
    }
    const p = { dir, name: 'dfi-lint', files, envFile: '.env.example' }
    step(label, 'docker', composeArgs(p, 'config', '-q'), dir)
  }
}

step('markdown links', 'docker', [
  'run', '--rm', '-v', `${root}:/input:ro`, '-w', '/input', 'lycheeverse/lychee:latest',
  '--no-progress', '--exclude-loopback', '--exclude', 'localhost', '--exclude', 'example\\.com',
  '--exclude-path', 'node_modules', '--exclude-path', 'docs/superpowers', '--exclude-path', '.superpowers', '.'
])
step('eslint', 'npx', ['eslint', '.'])
step('tsc', 'npx', ['tsc'])

process.exit(failed ? 1 : 0)
