import { test, expect } from '@playwright/test'
import { loginSuperadmin, createDataset } from './support.ts'

test.describe.configure({ mode: 'serial' })

test('every service answers through nginx', async ({ request }) => {
  // path -> status proving that the request reached the right service
  const expected: Record<string, number> = {
    '/data-fair/api/v1/ping': 200,
    '/simple-directory/.well-known/jwks.json': 200,
    // events ping is internal only, an authenticated route answers 401 to anonymous requests
    '/events/api/notifications': 401,
    '/openapi-viewer/': 200,
    '/mails/': 200
  }
  for (const [path, status] of Object.entries(expected)) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(status)
  }
  const root = await request.get('/', { maxRedirects: 0 })
  expect(root.status()).toBe(302)
  expect(root.headers().location).toContain('/data-fair/')
})

test('superadmin logs in', async ({ request }) => {
  await loginSuperadmin(request)
  const me = await request.get('/simple-directory/api/auth/me')
  expect(me.ok()).toBeTruthy()
  expect((await me.json()).isAdmin).toBeTruthy()
})

test('upload a csv, finalize it, query it', async ({ request }) => {
  await loginSuperadmin(request)
  const id = await createDataset(request, 'Smoke dataset')
  const lines = await (await request.get(`/data-fair/api/v1/datasets/${id}/lines`)).json()
  expect(lines.total).toBe(3)
  const apiDoc = await request.get(`/data-fair/api/v1/datasets/${id}/api-docs.json`)
  expect(apiDoc.ok()).toBeTruthy()
  expect((await apiDoc.json()).openapi).toMatch(/^3\./)
})

test('capture renders a screenshot', async ({ request, baseURL }) => {
  await loginSuperadmin(request)
  const res = await request.get(`/capture/api/v1/screenshot?target=${encodeURIComponent(baseURL + '/data-fair/')}`, { timeout: 120_000 })
  expect(res.status(), await res.text()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/^image\//)
})
