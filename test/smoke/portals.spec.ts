import { test, expect } from '@playwright/test'

test('the portals manager answers', async ({ request }) => {
  const res = await request.get('/portals-manager/api/ping')
  expect(res.status()).toBe(200)
})

// node may not resolve *.localhost, so the portal is requested on localhost with its Host header (browsers resolve *.localhost natively)
test('create a portal and open it on its subdomain', async ({ request, baseURL }) => {
  const res = await request.post('/portals-manager/api/portals', { data: { config: { title: 'Smoke portal' } } })
  expect(res.status(), await res.text()).toBeLessThan(300)
  const portal = await res.json()
  const host = `${portal._id}.portal.${new URL(baseURL!).hostname}`
  const page = await request.get('/', { headers: { host } })
  expect(page.status(), await page.text()).toBe(200)
  expect(await page.text()).toContain('Smoke portal')
})
