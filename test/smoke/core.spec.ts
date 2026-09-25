import { test, expect } from '@playwright/test'
import { createDataset } from './support.ts'

test.describe.configure({ mode: 'serial' })

test('every service answers through nginx', async ({ request }) => {
  // path -> status proving that the request reached the right service
  const expected: Record<string, number> = {
    '/data-fair/api/v1/ping': 200,
    '/simple-directory/.well-known/jwks.json': 200,
    // events ping is internal only, use an authenticated route (the session comes from auth.setup.ts)
    '/events/api/notifications': 200,
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

test('upload a csv, finalize it, query it', async ({ request }) => {
  const id = await createDataset(request, 'Smoke dataset')
  const lines = await (await request.get(`/data-fair/api/v1/datasets/${id}/lines`)).json()
  expect(lines.total).toBe(3)
  const apiDoc = await request.get(`/data-fair/api/v1/datasets/${id}/api-docs.json`)
  expect(apiDoc.ok()).toBeTruthy()
  expect((await apiDoc.json()).openapi).toMatch(/^3\./)
})

test('capture renders a screenshot', async ({ request, baseURL }) => {
  const res = await request.get(`/capture/api/v1/screenshot?target=${encodeURIComponent(baseURL + '/data-fair/')}`, { timeout: 120_000 })
  expect(res.status(), await res.text()).toBe(200)
  expect(res.headers()['content-type']).toMatch(/^image\//)
})
