import { test, expect } from '@playwright/test'
import { computeFindings, renderReport } from '../../scripts/lib/drift.ts'

const validated = { date: '2026-09-01', runs: { local: '2026-09-01' }, versions: { 'data-fair': '6.20.0', mongo: '8.0.17', events: '1.4.1' } }

test('no validation yet is an action', () => {
  const f = computeFindings({ validated: null, latest: {}, fileDiffs: {} })
  expect(f).toEqual([{ service: '*', level: 'action', message: 'no validated-versions.json yet, run npm run validate' }])
})

test('major bump is an action, minor with only added env is info', () => {
  const f = computeFindings({
    validated,
    latest: { 'data-fair': '7.0.0', events: '1.5.0', mongo: '8.0.17' },
    fileDiffs: { events: [{ path: 'api/config/custom-environment-variables.cjs', missing: false, envAdded: ['NEW_OPT'], envRemoved: [], requiredAdded: [] }] }
  })
  expect(f.find(x => x.service === 'data-fair')?.level).toBe('action')
  const ev = f.find(x => x.service === 'events')
  expect(ev?.level).toBe('info')
  expect(ev?.details?.join('\n')).toContain('NEW_OPT')
  expect(f.find(x => x.service === 'mongo')).toBeUndefined()
})

test('removed env, newly required config or missing file are actions', () => {
  const f = computeFindings({
    validated,
    latest: { events: '1.4.2', 'data-fair': '6.21.0' },
    fileDiffs: {
      events: [{ path: 'x', missing: false, envAdded: [], envRemoved: ['OLD'], requiredAdded: [] }],
      'data-fair': [{ path: 'api/config/type/schema.json', missing: true, envAdded: [], envRemoved: [], requiredAdded: [] }]
    }
  })
  expect(f.filter(x => x.level === 'action').map(x => x.service).sort()).toEqual(['data-fair', 'events'])
})

test('minor bump of mongo is an action, patch is info', () => {
  expect(computeFindings({ validated, latest: { mongo: '8.2.0' }, fileDiffs: {} })[0].level).toBe('action')
  expect(computeFindings({ validated, latest: { mongo: '8.0.18' }, fileDiffs: {} })[0].level).toBe('info')
})

test('a service never validated is an action', () => {
  const f = computeFindings({ validated, latest: { metrics: '2.5.0' }, fileDiffs: {} })
  expect(f[0]).toMatchObject({ service: 'metrics', level: 'action' })
})

test('a service whose tags could not be fetched is an action', () => {
  const f = computeFindings({ validated, latest: { events: null }, fileDiffs: {} })
  expect(f[0]).toMatchObject({ service: 'events', level: 'action' })
})

test('renderReport puts actions first and says when all is in sync', () => {
  const md = renderReport([
    { service: 'events', level: 'info', message: 'i' },
    { service: 'data-fair', level: 'action', message: 'a' }
  ])
  expect(md.indexOf('Action needed')).toBeLessThan(md.indexOf('For information'))
  expect(renderReport([])).toContain('in sync')
})

test('a recorded version that is not x.y.z is an action', () => {
  const f = computeFindings({ validated: { ...validated, versions: { events: 'unknown' } }, latest: { events: '1.4.1' }, fileDiffs: {} })
  expect(f[0]).toMatchObject({ service: 'events', level: 'action' })
})

test('a config diff that could not be computed is an action', () => {
  const f = computeFindings({
    validated,
    latest: { events: '1.4.2' },
    fileDiffs: { events: [{ path: 'x', missing: false, envAdded: [], envRemoved: [], requiredAdded: [], error: 'fetch failed' }] }
  })
  expect(f[0]).toMatchObject({ service: 'events', level: 'action' })
  expect(f[0].details?.join()).toContain('fetch failed')
})
