import { test, expect } from '@playwright/test'
import { certificateErrors } from '../../scripts/lib/tls.ts'

const portalsSan = 'DNS:*.portal.example.com, DNS:*.draft.portal.example.com'

test('no error when each host gets a certificate with exactly its own names', () => {
  expect(certificateErrors('example.com', {
    'example.com': 'DNS:example.com',
    'x.portal.example.com': portalsSan,
    'x.draft.portal.example.com': portalsSan
  })).toEqual([])
})

test('draft portal hosts need their own wildcard (a wildcard covers a single label)', () => {
  const errors = certificateErrors('example.com', {
    'example.com': 'DNS:example.com',
    'x.portal.example.com': 'DNS:*.portal.example.com',
    'x.draft.portal.example.com': 'DNS:*.portal.example.com'
  })
  expect(errors.length).toBeGreaterThan(0)
})

test('a wildcard in the main certificate is an error (HTTP-01 cannot validate it)', () => {
  const errors = certificateErrors('example.com', {
    'example.com': 'DNS:example.com, DNS:*.portal.example.com',
    'x.portal.example.com': portalsSan,
    'x.draft.portal.example.com': portalsSan
  })
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('example.com')
})

test('missing certificates are errors', () => {
  expect(certificateErrors('example.com', { 'example.com': 'DNS:example.com' })).toEqual([
    'x.portal.example.com: no certificate served',
    'x.draft.portal.example.com: no certificate served'
  ])
})
