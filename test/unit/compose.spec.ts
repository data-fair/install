import { test, expect } from '@playwright/test'
import { composeArgs, parsePs, notReady } from '../../scripts/lib/compose.ts'

const p = { dir: '/tmp/x', name: 'dfi-local', files: ['compose.yaml', 'override.yaml'], envFile: '.env' }

test('composeArgs puts project, env file and files first', () => {
  expect(composeArgs(p, 'up', '-d')).toEqual([
    'compose', '-p', 'dfi-local', '--env-file', '.env', '-f', 'compose.yaml', '-f', 'override.yaml', 'up', '-d'
  ])
})

test('parsePs accepts NDJSON', () => {
  const out = '{"Service":"mongo","State":"running","Health":"healthy"}\n{"Service":"nginx","State":"running","Health":""}\n'
  expect(parsePs(out)).toEqual([
    { service: 'mongo', state: 'running', health: 'healthy' },
    { service: 'nginx', state: 'running', health: '' }
  ])
})

test('parsePs accepts a JSON array and empty output', () => {
  expect(parsePs('[{"Service":"a","State":"exited","Health":""}]')).toEqual([{ service: 'a', state: 'exited', health: '' }])
  expect(parsePs('')).toEqual([])
})

test('notReady lists non running and non healthy containers', () => {
  const states = [
    { service: 'a', state: 'running', health: 'healthy' },
    { service: 'b', state: 'running', health: 'starting' },
    { service: 'c', state: 'exited', health: '' },
    { service: 'd', state: 'running', health: '' }
  ]
  expect(notReady(states).map(s => s.service)).toEqual(['b', 'c', 'd'])
})
