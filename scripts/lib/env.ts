import { randomBytes } from 'node:crypto'

export const randomSecret = (): string => randomBytes(32).toString('base64url')

// replace every value equal to CHANGE_ME with a fresh random secret, then apply overrides
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
