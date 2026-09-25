import { resolve } from 'node:path'

export type Variant = 'local' | 'production' | 'production+bonus'
export const VARIANTS: Variant[] = ['local', 'production', 'production+bonus']

const root = resolve(import.meta.dirname, '../..')
export const recipeDir = (v: Variant): string => resolve(root, 'recipes', v === 'local' ? 'local' : 'production')

// compose files relative to the recipe directory, with test only overrides when validating
export function composeFiles (v: Variant, opts: { test: boolean }): string[] {
  if (v === 'local') return ['compose.yaml']
  const files = ['compose.yaml']
  if (v === 'production+bonus') files.push('compose.bonus.yaml')
  if (opts.test) files.push('../../test/production.override.yaml')
  return files
}

// .env values replaced when validating a recipe on this machine
// not plain "localhost": inside containers it designates the container itself, *.localhost is resolved by browsers
// and reaches nginx from other containers through its network alias
export function testEnvOverrides (v: Variant): Record<string, string> {
  if (v === 'local') return {}
  const overrides: Record<string, string> = {
    DOMAIN: 'datafair.localhost',
    BASE_URL: 'http://datafair.localhost',
    CONTACT_EMAIL: 'admin@example.com',
    ADMINS: '["admin@example.com"]',
    MAILS_TRANSPORT: '{"host":"maildev","port":1025,"ignoreTLS":true}'
  }
  // the workers refuse to start without a key, a real one would require creating it in data-fair first
  if (v === 'production+bonus') overrides.DATA_FAIR_API_KEY = 'not-provisioned'
  return overrides
}

export function parseVariantArgs (argv: string[]): { variant: Variant, keep: boolean } {
  const [recipe, ...flags] = argv
  if (recipe !== 'local' && recipe !== 'production') throw new Error('usage: validate <local|production> [--bonus] [--keep]')
  const bonus = flags.includes('--bonus')
  if (bonus && recipe === 'local') throw new Error('--bonus only applies to the production recipe')
  return { variant: bonus ? 'production+bonus' : recipe, keep: flags.includes('--keep') }
}

// mongo >= 8.0.x recent patches refuse to start on linux 6.19 to 7.0.13 (TCMalloc rseq incompatibility,
// https://jira.mongodb.org/browse/SERVER-121912), validation on such a machine pins the last version that starts
export function mongoKernelWorkaround (kernelRelease: string): string | null {
  const m = kernelRelease.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  const [maj, min, patch] = m.slice(1).map(Number)
  const affected = (maj === 6 && min >= 19) || (maj === 7 && min === 0 && patch < 14)
  return affected ? 'mongo:8.0.17' : null
}
