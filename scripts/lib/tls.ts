import { connect } from 'node:tls'

// the host names served by the production recipe and the certificate names each one must present
export const expectedNames = (domain: string): Record<string, string[]> => ({
  [domain]: [domain],
  [`x.portal.${domain}`]: [`*.portal.${domain}`]
})

// sans: served host -> subjectaltname string as returned by node tls ("DNS:a, DNS:b")
export function certificateErrors (domain: string, sans: Record<string, string>): string[] {
  const errors: string[] = []
  for (const [host, names] of Object.entries(expectedNames(domain))) {
    const san = sans[host]
    if (!san) {
      errors.push(`${host}: no certificate served`)
      continue
    }
    const served = san.split(',').map(s => s.trim().replace(/^DNS:/, '')).sort()
    if (JSON.stringify(served) !== JSON.stringify([...names].sort())) {
      errors.push(`${host}: certificate names are ${served.join(', ')}, expected ${names.join(', ')}`)
    }
  }
  return errors
}

export function servedSan (port: number, servername: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, servername, rejectUnauthorized: false }, () => {
      const san = socket.getPeerCertificate().subjectaltname
      socket.end()
      resolve(san)
    })
    socket.on('error', () => resolve(undefined))
  })
}
