import { test, expect } from '@playwright/test'
import { variant, ADMIN_EMAIL, ADMIN_PASSWORD } from './support.ts'

test.describe('without the bonus overlay', () => {
  test.skip(variant !== 'production', 'only checked on the plain production recipe')
  test('bonus routes answer 502 but nginx keeps serving', async ({ request }) => {
    expect((await request.get('/processings/api/v1/_ping')).status()).toBe(502)
    expect((await request.get('/data-fair/api/v1/ping')).status()).toBe(200)
  })
})

test.describe('with the bonus overlay', () => {
  test.skip(variant !== 'production+bonus', 'bonus overlay not enabled')

  test('bonus services answer through nginx', async ({ request }) => {
    for (const path of ['/registry/api/ping', '/processings/api/v1/_ping', '/catalogs/api/ping']) {
      expect((await request.get(path)).status(), path).toBe(200)
    }
  })

  test('superadmin can list processings and catalogs', async ({ request }) => {
    for (const path of ['/processings/api/v1/processings', '/catalogs/api/catalogs']) {
      const res = await request.get(path)
      expect(res.status(), `${path}: ${await res.text()}`).toBe(200)
    }
  })

  // follows docs/bonus-services.md, requires the registry URL and read API key of a koumoul.com subscription
  test('plugins can be mirrored from the Koumoul registry', async ({ playwright, baseURL }) => {
    const url = process.env.KOUMOUL_REGISTRY_URL
    const apiKey = process.env.KOUMOUL_REGISTRY_API_KEY
    test.skip(!url || !apiKey, 'KOUMOUL_REGISTRY_URL and KOUMOUL_REGISTRY_API_KEY not set')
    // configuring remote registries requires the admin mode of the superadmin session
    const admin = await playwright.request.newContext({ baseURL })
    const login = await admin.post('/simple-directory/api/auth/password', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, adminMode: true } })
    expect(login.ok(), await login.text()).toBeTruthy()
    expect((await admin.get(await login.text())).ok()).toBeTruthy()
    const created = await admin.post('/registry/api/v1/remote-registries', { data: { url, name: 'Koumoul', apiKey } })
    expect(created.status(), await created.text()).toBe(201)
    const artefacts = await admin.get(`/registry/api/v1/remote-registries/${encodeURIComponent(url!)}/remote-artefacts`)
    expect(artefacts.status(), await artefacts.text()).toBe(200)
    expect((await artefacts.json()).results?.length).toBeGreaterThan(0)
    await admin.dispose()
  })
})
