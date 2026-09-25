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
