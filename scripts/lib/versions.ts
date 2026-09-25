export function parseSemver (v: string): [number, number, number] | null {
  const m = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const cmp = (a: [number, number, number], b: [number, number, number]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// the highest x.y.z tag, optionally restricted to the major version of another version
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

// env variable names declared by a config mapping file (custom-environment-variables.*)
// or by the flat runtimeConfig block of a nuxt config (NUXT_ + screaming snake case of the keys)
export function extractEnvNames (source: string): string[] {
  const names = new Set<string>()
  const runtime = source.match(/runtimeConfig:\s*\{([\s\S]*?)\}/)
  if (runtime) {
    for (const m of runtime[1].matchAll(/(\w+)\s*:/g)) names.add('NUXT_' + snake(m[1]))
  } else {
    for (const m of source.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)) names.add(m[1])
  }
  return [...names].sort()
}

// dotted paths of the required properties of a JSON schema
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
