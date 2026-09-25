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
  type Issue = { number: number, title: string, body: string, pull_request?: unknown }
  const labeled: Issue[] = await call(`${api}?state=open&labels=${LABEL}`)
  let existing = labeled[0]
  let relabel = false
  if (!existing) {
    // the label may have been dropped at creation (token not allowed to create labels): find the issue by title
    const open: Issue[] = await call(`${api}?state=open&per_page=100`)
    existing = open.find(i => i.title === opts.title && !i.pull_request) as Issue
    relabel = !!existing
  }
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
  if (existing.body === opts.body && !relabel) return 'noop'
  await call(`${api}/${existing.number}`, 'PATCH', relabel ? { body: opts.body, labels: [LABEL] } : { body: opts.body })
  return 'updated'
}
