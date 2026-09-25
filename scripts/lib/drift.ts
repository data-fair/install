import type { ValidatedVersions } from './services.ts'
import { SERVICES } from './services.ts'
import { bumpKind } from './versions.ts'

export type FileDiff = { path: string, missing: boolean, envAdded: string[], envRemoved: string[], requiredAdded: string[] }
export type Finding = { service: string, level: 'action' | 'info', message: string, details?: string[] }

// latest: service -> latest published version, null when it could not be determined
export function computeFindings (input: { validated: ValidatedVersions | null, latest: Record<string, string | null>, fileDiffs: Record<string, FileDiff[]> }): Finding[] {
  if (!input.validated) return [{ service: '*', level: 'action', message: 'no validated-versions.json yet, run npm run validate' }]
  const findings: Finding[] = []
  for (const [service, latest] of Object.entries(input.latest)) {
    if (!latest) {
      findings.push({ service, level: 'action', message: 'could not find a published version, check the image name and the registry' })
      continue
    }
    const current = input.validated.versions[service]
    if (!current) {
      findings.push({ service, level: 'action', message: `never validated, latest is ${latest}` })
      continue
    }
    const bump = bumpKind(current, latest)
    if (bump === 'none') continue
    const def = SERVICES.find(s => s.key === service)
    const details: string[] = []
    // a pinned minor version (mongo, elasticsearch, registry) must be bumped by hand in the recipes
    let action = bump === 'major' || (def?.track === 'minor' && bump === 'minor')
    for (const d of input.fileDiffs[service] ?? []) {
      if (d.missing) { action = true; details.push(`\`${d.path}\` not found at ${latest}, the repository layout changed`) }
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
    'See [MAINTENANCE.md](../blob/main/MAINTENANCE.md) for the procedure.', ''
  ].join('\n')
}
