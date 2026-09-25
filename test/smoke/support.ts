import { expect, type APIRequestContext } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'

export const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL ?? 'admin@example.com'
export const ADMIN_PASSWORD = 'Smoke-test-Passw0rd!'
export const variant = (process.env.SMOKE_VARIANT ?? 'local') as 'local' | 'production' | 'production+bonus'

export function envValue (key: string): string {
  const line = (process.env.SMOKE_ENV ?? '').split('\n').find(l => l.startsWith(key + '='))
  if (!line) throw new Error(`missing ${key} in .env`)
  return line.slice(key.length + 1)
}

export async function latestMail (request: APIRequestContext, to: string, after: number) {
  for (let i = 0; i < 30; i++) {
    const res = await request.get('/mails/email')
    expect(res.ok()).toBeTruthy()
    const mails: any[] = await res.json()
    const mail = mails.reverse().find(m => m.to?.some((t: any) => t.address === to) && new Date(m.date).getTime() >= after)
    if (mail) return { html: mail.html as string, subject: mail.subject as string }
    await sleep(2000)
  }
  throw new Error(`no mail received for ${to}`)
}

// ajax password login answers with a callback url, visiting it sets the session cookies
async function passwordLogin (request: APIRequestContext): Promise<boolean> {
  const res = await request.post('/simple-directory/api/auth/password', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  if (!res.ok()) return false
  const callback = await request.get(await res.text())
  expect(callback.ok(), `login callback: ${callback.status()}`).toBeTruthy()
  return true
}

// idempotent: works on a fresh stack (reset flow through maildev) and on a stack where the password is already set
export async function loginSuperadmin (request: APIRequestContext) {
  if (await passwordLogin(request)) return
  const start = Date.now() - 1000
  const action = await request.post('/simple-directory/api/auth/action', { data: { email: ADMIN_EMAIL, action: 'changePassword' } })
  expect(action.status()).toBe(204)
  const mail = await latestMail(request, ADMIN_EMAIL, start)
  const token = mail.html.match(/action_token=([\w.-]+)/)?.[1]
  expect(token, 'action token in reset mail').toBeTruthy()
  const { id } = JSON.parse(Buffer.from(token!.split('.')[1], 'base64url').toString())
  const change = await request.post(`/simple-directory/api/users/${id}/password?action_token=${token}`, { data: { password: ADMIN_PASSWORD } })
  expect(change.status(), await change.text()).toBe(204)
  expect(await passwordLogin(request), 'login with the new password').toBe(true)
}

export async function createDataset (request: APIRequestContext, title: string): Promise<string> {
  const csv = 'id,label,value\n1,one,1.5\n2,two,2.5\n3,three,3.5\n'
  const res = await request.post('/data-fair/api/v1/datasets', {
    multipart: { title, file: { name: 'smoke.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) } }
  })
  expect(res.status(), await res.text()).toBe(201)
  const { id } = await res.json()
  for (let i = 0; i < 90; i++) {
    const d = await (await request.get(`/data-fair/api/v1/datasets/${id}`)).json()
    if (d.status === 'finalized') return id
    if (d.status === 'error') throw new Error(`dataset in error: ${JSON.stringify(d.errorStatus ?? d)}`)
    await sleep(2000)
  }
  throw new Error('dataset not finalized in time')
}
