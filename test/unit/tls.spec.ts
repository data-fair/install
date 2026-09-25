import { test, expect } from '@playwright/test'
import { certificateErrors } from '../../scripts/lib/tls.ts'

test('no error when each host gets a certificate with exactly its own names', () => {
  expect(certificateErrors('example.com', {
    'example.com': 'DNS:example.com',
    'x.portal.example.com': 'DNS:*.portal.example.com'
  })).toEqual([])
})

test('a wildcard in the main certificate is an error (HTTP-01 cannot validate it)', () => {
  const errors = certificateErrors('example.com', {
    'example.com': 'DNS:example.com, DNS:*.portal.example.com',
    'x.portal.example.com': 'DNS:*.portal.example.com'
  })
  expect(errors).toHaveLength(1)
  expect(errors[0]).toContain('example.com')
})

test('a missing certificate is an error', () => {
  expect(certificateErrors('example.com', { 'example.com': 'DNS:example.com' })).toHaveLength(1)
})
