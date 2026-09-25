import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { request } from 'node:http'
import { fillEnv } from './env.ts'
import { runCompose, type ComposeProject } from './compose.ts'
import { certificateErrors, expectedNames, servedSan } from './tls.ts'

const root = resolve(import.meta.dirname, '../..')

// start the production nginx (jonasal/nginx-certbot) with a local CA and check the certificates it serves
// this validates the TLS server blocks and the certificate requests that the http-only validation replaces
export async function runTlsCheck (log: (line: string) => void): Promise<boolean> {
  const domain = 'datafair.localhost'
  const work = await mkdtemp(join(tmpdir(), 'dfi-tls-'))
  const dir = join(work, 'recipes/production')
  await cp(resolve(root, 'recipes/production'), dir, { recursive: true })
  await cp(resolve(root, 'test'), join(work, 'test'), { recursive: true, filter: src => !src.includes('reports') })
  const example = await readFile(join(dir, '.env.example'), 'utf8')
  await writeFile(join(dir, '.env'), fillEnv(example, { DOMAIN: domain, BASE_URL: `https://${domain}`, CERTBOT_DNS_PROVIDER: 'ovh' }))
  await writeFile(join(dir, 'certbot-dns.ini'), 'dns_ovh_endpoint = ovh-eu\n')
  const p: ComposeProject = { dir, name: 'dfi-tls', files: ['compose.yaml', '../../test/production.tls.override.yaml'], envFile: '.env' }
  try {
    const up = await runCompose(p, ['up', '-d', '--quiet-pull', 'nginx'])
    if (up.code !== 0) throw new Error(up.stderr)
    const sans: Record<string, string> = {}
    for (let i = 0; i < 30; i++) {
      for (const host of Object.keys(expectedNames(domain))) {
        const san = await servedSan(18443, host)
        if (san) sans[host] = san
      }
      if (Object.keys(sans).length === Object.keys(expectedNames(domain)).length && !certificateErrors(domain, sans).length) break
      await sleep(2000)
    }
    const errors = certificateErrors(domain, sans)
    // node fetch ignores the host header, use http.request
    const redirect = await new Promise<{ status?: number, location?: string }>((resolve, reject) => {
      request({ host: '127.0.0.1', port: 18080, path: '/data-fair/', headers: { host: domain } }, res => {
        res.resume()
        resolve({ status: res.statusCode, location: res.headers.location })
      }).on('error', reject).end()
    })
    if (redirect.status !== 301 || redirect.location !== `https://${domain}/data-fair/`) {
      errors.push(`http is not redirected to https (${redirect.status} ${redirect.location})`)
    }
    for (const e of errors) log(`- TLS ERROR: ${e}`)
    if (errors.length) log('```\n' + (await runCompose(p, ['logs', '--no-color', '--tail', '25'])).stdout + '\n```')
    else log('- TLS: certificates and https redirect OK (local CA)')
    return !errors.length
  } finally {
    await runCompose(p, ['down', '-v'])
    await rm(work, { recursive: true, force: true })
  }
}
