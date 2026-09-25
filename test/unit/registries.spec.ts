import { test, expect } from '@playwright/test'
import { fetchRepoFile } from '../../scripts/lib/registries.ts'

const fakeFetch = (statuses: number[]) => {
  const urls: string[] = []
  const impl = (async (url: string) => {
    urls.push(url)
    const status = statuses.shift() ?? 404
    return new Response(status === 200 ? 'content' : 'error', { status })
  }) as unknown as typeof fetch
  return { impl, urls }
}

test('fetchRepoFile tries the v-prefixed tag, then the bare version', async () => {
  const f = fakeFetch([404, 200])
  expect(await fetchRepoFile('data-fair/events', '1.4.1', 'a.cjs', f.impl)).toBe('content')
  expect(f.urls).toEqual([
    'https://raw.githubusercontent.com/data-fair/events/v1.4.1/a.cjs',
    'https://raw.githubusercontent.com/data-fair/events/1.4.1/a.cjs'
  ])
})

test('fetchRepoFile returns null only when the file is not found', async () => {
  expect(await fetchRepoFile('r', '1.0.0', 'a', fakeFetch([404, 404]).impl)).toBeNull()
})

test('fetchRepoFile throws on other errors (rate limit, server error)', async () => {
  await expect(fetchRepoFile('r', '1.0.0', 'a', fakeFetch([429]).impl)).rejects.toThrow(/429/)
})
