import { test, expect } from '@playwright/test'
import { variant } from './support.ts'

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
})
