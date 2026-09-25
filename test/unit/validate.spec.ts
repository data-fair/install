import { test, expect } from '@playwright/test'
import { mergeValidated, shouldRecord, servicesFor, renderLastValidated, versionProblems } from '../../scripts/lib/services.ts'

test('shouldRecord only on full success', () => {
  expect(shouldRecord({ healthy: true, smokeCode: 0 })).toBe(true)
  expect(shouldRecord({ healthy: true, smokeCode: 1 })).toBe(false)
  expect(shouldRecord({ healthy: false, smokeCode: 0 })).toBe(false)
  expect(shouldRecord({ healthy: true, smokeCode: 0, tls: false })).toBe(false)
  expect(shouldRecord({ healthy: true, smokeCode: 0, tls: true })).toBe(true)
})

test('mergeValidated keeps versions of services not covered by this run', () => {
  const prev = { date: '2026-01-01', runs: { local: '2026-01-01' }, versions: { 'data-fair': '6.1.0', metrics: '2.0.0' } }
  const next = mergeValidated(prev, 'local', '2026-02-01', { 'data-fair': '6.2.0' })
  expect(next.versions).toEqual({ 'data-fair': '6.2.0', metrics: '2.0.0' })
  expect(next.runs.local).toBe('2026-02-01')
  expect(next.date).toBe('2026-02-01')
})

test('mergeValidated from scratch', () => {
  expect(mergeValidated(null, 'production', '2026-02-01', { mongo: '8.0.17' })).toEqual({
    date: '2026-02-01', runs: { production: '2026-02-01' }, versions: { mongo: '8.0.17' }
  })
})

test('services per variant', () => {
  const local = servicesFor('local').map(s => s.key)
  expect(local).toContain('portals')
  expect(local).not.toContain('metrics')
  expect(local).not.toContain('processings')
  expect(servicesFor('production').map(s => s.key)).toContain('metrics')
  expect(servicesFor('production+bonus').map(s => s.key)).toContain('registry')
})

test('renderLastValidated', () => {
  const md = renderLastValidated({ date: '2026-02-01', runs: { local: '2026-02-01' }, versions: { 'data-fair': '6.2.0' } })
  expect(md).toContain('2026-02-01')
  expect(md).toContain('| data-fair | 6.2.0 |')
})

test('shouldRecord refuses a run whose running versions could not all be read', () => {
  expect(shouldRecord({ healthy: true, smokeCode: 0, versionsOk: false })).toBe(false)
})

test('versionProblems lists services without a readable x.y.z version', () => {
  const services = servicesFor('local')
  const versions = Object.fromEntries(services.map(s => [s.key, '1.2.3']))
  expect(versionProblems(versions, services)).toEqual([])
  expect(versionProblems({ ...versions, portals: 'unknown', mongo: '' }, services)).toEqual(['portals: "unknown"', 'mongo: ""'])
  const { events, ...missing } = versions
  expect(versionProblems(missing, services)).toEqual(['events: not read'])
})
