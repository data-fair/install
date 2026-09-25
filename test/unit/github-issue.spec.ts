import { test, expect } from '@playwright/test'
import { syncIssue } from '../../scripts/lib/github-issue.ts'

function fakeFetch (openIssues: any[]) {
  const calls: { method: string, url: string, body?: any }[] = []
  const impl = (async (url: string, init: any = {}) => {
    calls.push({ method: init.method ?? 'GET', url, body: init.body && JSON.parse(init.body) })
    const json = (init.method ?? 'GET') === 'GET' ? openIssues : { number: 1 }
    return new Response(JSON.stringify(json), { status: 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const base = { token: 't', repo: 'data-fair/install', title: 'Install docs drift' }

test('creates the issue when findings and none open', async () => {
  const f = fakeFetch([])
  expect(await syncIssue({ ...base, body: 'report', fetchImpl: f.impl })).toBe('created')
  expect(f.calls[1]).toMatchObject({ method: 'POST', body: { title: 'Install docs drift', body: 'report', labels: ['install-drift'] } })
})

test('updates the open issue', async () => {
  const f = fakeFetch([{ number: 7, body: 'old' }])
  expect(await syncIssue({ ...base, body: 'new', fetchImpl: f.impl })).toBe('updated')
  expect(f.calls[1]).toMatchObject({ method: 'PATCH', body: { body: 'new' } })
  expect(f.calls[1].url).toMatch(/issues\/7$/)
})

test('no update when the body did not change', async () => {
  const f = fakeFetch([{ number: 7, body: 'same' }])
  expect(await syncIssue({ ...base, body: 'same', fetchImpl: f.impl })).toBe('noop')
})

test('closes the open issue when in sync', async () => {
  const f = fakeFetch([{ number: 7, body: 'old' }])
  expect(await syncIssue({ ...base, body: null, fetchImpl: f.impl })).toBe('closed')
  expect(f.calls.at(-1)).toMatchObject({ method: 'PATCH', body: { state: 'closed' } })
})

test('noop when in sync and nothing open', async () => {
  const f = fakeFetch([])
  expect(await syncIssue({ ...base, body: null, fetchImpl: f.impl })).toBe('noop')
})

test('api errors are thrown with their status', async () => {
  const impl = (async () => new Response('bad credentials', { status: 401 })) as unknown as typeof fetch
  await expect(syncIssue({ ...base, body: 'x', fetchImpl: impl })).rejects.toThrow(/401/)
})
