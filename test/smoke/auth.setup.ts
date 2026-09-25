import { test as setup, expect } from '@playwright/test'
import { loginSuperadmin, storageStatePath } from './support.ts'

// log in once for all smoke tests, simple-directory rate limits authentication attempts
setup('superadmin logs in', async ({ request }) => {
  await loginSuperadmin(request)
  const me = await request.get('/simple-directory/api/auth/me')
  expect(me.ok()).toBeTruthy()
  expect((await me.json()).isAdmin).toBeTruthy()
  await request.storageState({ path: storageStatePath })
})
