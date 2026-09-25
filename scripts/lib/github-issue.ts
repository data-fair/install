const LABEL = 'install-drift'

// keep a single open issue (identified by its label) in sync with the drift report, close it when in sync
export async function syncIssue (opts: { token: string, repo: string, title: string, body: string | null, fetchImpl?: typeof fetch }): Promise<'created' | 'updated' | 'closed' | 'noop'> {
  const f = opts.fetchImpl ?? fetch
  const api = `https://api.github.com/repos/${opts.repo}/issues`
  const headers = { authorization: `Bearer ${opts.token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' }
  const call = async (url: string, method = 'GET', body?: unknown) => {
    const res = await f(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!res.ok) throw new Error(`GitHub API ${method} ${url}: ${res.status} ${await res.text()}`)
    return res.json()
  }
  const open: { number: number, body: string }[] = await call(`${api}?state=open&labels=${LABEL}`)
  const existing = open[0]
  if (opts.body === null) {
    if (!existing) return 'noop'
    await call(`${api}/${existing.number}/comments`, 'POST', { body: 'All services are in sync with the last validation, closing.' })
    await call(`${api}/${existing.number}`, 'PATCH', { state: 'closed' })
    return 'closed'
  }
  if (!existing) {
    await call(api, 'POST', { title: opts.title, body: opts.body, labels: [LABEL] })
    return 'created'
  }
  if (existing.body === opts.body) return 'noop'
  await call(`${api}/${existing.number}`, 'PATCH', { body: opts.body })
  return 'updated'
}
