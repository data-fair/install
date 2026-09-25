import { test, expect } from '@playwright/test'
import { fillEnv, randomSecret } from '../../scripts/lib/env.ts'

test('randomSecret is long and url safe', () => {
  const s = randomSecret()
  expect(s).toMatch(/^[A-Za-z0-9_-]{32,}$/)
  expect(randomSecret()).not.toBe(s)
})

test('fillEnv replaces CHANGE_ME values and keeps comments', () => {
  const out = fillEnv('# comment\nSECRET=CHANGE_ME\nCIPHER_PASSWORD=CHANGE_ME\nBASE_URL=http://localhost\n')
  const lines = out.split('\n')
  expect(lines[0]).toBe('# comment')
  expect(lines[1]).toMatch(/^SECRET=[A-Za-z0-9_-]{32,}$/)
  expect(lines[2]).toMatch(/^CIPHER_PASSWORD=[A-Za-z0-9_-]{32,}$/)
  expect(lines[1].split('=')[1]).not.toBe(lines[2].split('=')[1])
  expect(lines[3]).toBe('BASE_URL=http://localhost')
})

test('fillEnv applies overrides and appends missing keys', () => {
  const out = fillEnv('DOMAIN=example.com\n', { DOMAIN: 'localhost', EXTRA: 'x' })
  expect(out).toContain('DOMAIN=localhost')
  expect(out).not.toContain('example.com')
  expect(out).toContain('EXTRA=x')
})

test('fillEnv keeps values containing = signs intact', () => {
  const out = fillEnv('MAILS_TRANSPORT={"host":"a=b"}\n')
  expect(out).toContain('MAILS_TRANSPORT={"host":"a=b"}')
})
