import type { Variant } from './recipes.ts'

export type VersionSource = 'label' | 'mongo' | 'elasticsearch'
export type Service = {
  // name in validated-versions.json
  key: string
  // compose services running this image, the first one is used to read the running version
  composeServices: string[]
  image: string
  registry: 'ghcr' | 'dockerhub'
  // github repository, used to diff config files between versions
  repo?: string
  configFiles?: string[]
  // 'major': compose uses a floating major tag, 'minor': compose pins a minor version
  track: 'major' | 'minor'
  variants: Variant[]
  versionFrom: VersionSource
}

const all: Variant[] = ['local', 'production', 'production+bonus']
const prod: Variant[] = ['production', 'production+bonus']
const bonus: Variant[] = ['production+bonus']

const cev = 'api/config/custom-environment-variables'
const schema = 'api/config/type/schema.json'

export const SERVICES: Service[] = [
  { key: 'data-fair', composeServices: ['data-fair', 'data-fair-worker'], image: 'ghcr.io/data-fair/data-fair', registry: 'ghcr', repo: 'data-fair/data-fair', configFiles: [`${cev}.cjs`, schema], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'simple-directory', composeServices: ['simple-directory'], image: 'ghcr.io/data-fair/simple-directory', registry: 'ghcr', repo: 'data-fair/simple-directory', configFiles: [`${cev}.cjs`, schema], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'events', composeServices: ['events'], image: 'ghcr.io/data-fair/events', registry: 'ghcr', repo: 'data-fair/events', configFiles: [`${cev}.cjs`, schema], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'openapi-viewer', composeServices: ['openapi-viewer'], image: 'ghcr.io/data-fair/openapi-viewer', registry: 'ghcr', repo: 'data-fair/openapi-viewer', configFiles: [`${cev}.cjs`, schema], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'capture', composeServices: ['capture'], image: 'ghcr.io/data-fair/capture', registry: 'ghcr', repo: 'data-fair/capture', configFiles: ['config/custom-environment-variables.cjs', 'config/type/schema.json'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'portals', composeServices: ['portals-manager', 'portal'], image: 'ghcr.io/data-fair/portals/manager', registry: 'ghcr', repo: 'data-fair/portals', configFiles: [`${cev}.js`, schema, 'portal/nuxt.config.ts'], track: 'major', variants: all, versionFrom: 'label' },
  { key: 'metrics', composeServices: ['metrics', 'metrics-daemon'], image: 'ghcr.io/data-fair/metrics', registry: 'ghcr', repo: 'data-fair/metrics', configFiles: [`${cev}.cjs`, schema, 'daemon/config/custom-environment-variables.cjs'], track: 'major', variants: prod, versionFrom: 'label' },
  { key: 'registry', composeServices: ['registry'], image: 'ghcr.io/data-fair/registry', registry: 'ghcr', repo: 'data-fair/registry', configFiles: [`${cev}.js`, schema], track: 'minor', variants: bonus, versionFrom: 'label' },
  { key: 'processings', composeServices: ['processings', 'processings-worker'], image: 'ghcr.io/data-fair/processings', registry: 'ghcr', repo: 'data-fair/processings', configFiles: [`${cev}.mjs`, schema, 'worker/config/custom-environment-variables.mjs'], track: 'major', variants: bonus, versionFrom: 'label' },
  { key: 'catalogs', composeServices: ['catalogs', 'catalogs-worker'], image: 'ghcr.io/data-fair/catalogs', registry: 'ghcr', repo: 'data-fair/catalogs', configFiles: [`${cev}.mjs`, schema, 'worker/config/custom-environment-variables.mjs'], track: 'major', variants: bonus, versionFrom: 'label' },
  { key: 'mongo', composeServices: ['mongo'], image: 'mongo', registry: 'dockerhub', track: 'minor', variants: all, versionFrom: 'mongo' },
  { key: 'elasticsearch', composeServices: ['elasticsearch'], image: 'ghcr.io/data-fair/elasticsearch', registry: 'ghcr', track: 'minor', variants: all, versionFrom: 'elasticsearch' }
]

export const servicesFor = (v: Variant): Service[] => SERVICES.filter(s => s.variants.includes(v))

export type ValidatedVersions = { date: string, runs: Partial<Record<Variant, string>>, versions: Record<string, string> }

// a run only covers the services of its variant, versions of the others are kept
export function mergeValidated (prev: ValidatedVersions | null, variant: Variant, date: string, versions: Record<string, string>): ValidatedVersions {
  return {
    date,
    runs: { ...prev?.runs, [variant]: date },
    versions: { ...prev?.versions, ...versions }
  }
}

// tls is only checked for the production recipe
export const shouldRecord = (r: { healthy: boolean, smokeCode: number, tls?: boolean, versionsOk?: boolean }): boolean =>
  r.healthy && r.smokeCode === 0 && r.tls !== false && r.versionsOk !== false

// a validation is only recorded with an exact x.y.z version for each service of the run
export function versionProblems (versions: Record<string, string>, services: Service[]): string[] {
  const problems: string[] = []
  for (const s of services) {
    if (!(s.key in versions)) problems.push(`${s.key}: not read`)
    else if (!/^\d+\.\d+\.\d+$/.test(versions[s.key])) problems.push(`${s.key}: ${JSON.stringify(versions[s.key])}`)
  }
  return problems
}

export function renderLastValidated (v: ValidatedVersions): string {
  const runs = Object.entries(v.runs).map(([k, d]) => `${k} (${d})`).join(', ')
  const rows = Object.entries(v.versions).sort().map(([k, ver]) => `| ${k} | ${ver} |`).join('\n')
  return `Last validated on ${v.date}: ${runs}.\n\n| Service | Version |\n|---|---|\n${rows}\n`
}
