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

// docker compose ps --format json prints NDJSON in recent versions, a JSON array in older ones
export function parsePs (output: string): ContainerState[] {
  const trimmed = output.trim()
  if (!trimmed) return []
  const raw: any[] = trimmed.startsWith('[') ? JSON.parse(trimmed) : trimmed.split('\n').map(l => JSON.parse(l))
  return raw.map(c => ({ service: c.Service, state: c.State, health: c.Health ?? '' }))
}

// every recipe service declares a healthcheck, so a running container without health status is not ready either
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
