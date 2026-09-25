import type { Service } from './services.ts'

async function ghcrTags (image: string): Promise<string[]> {
  const repo = image.replace(/^ghcr\.io\//, '')
  const { token } = await (await fetch(`https://ghcr.io/token?scope=repository:${repo}:pull`)).json() as { token: string }
  const tags: string[] = []
  let url: string | null = `https://ghcr.io/v2/${repo}/tags/list?n=1000`
  while (url) {
    const res: Response = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`ghcr tags ${repo}: ${res.status}`)
    tags.push(...((await res.json()) as { tags: string[] }).tags)
    const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
    url = next ? new URL(next, 'https://ghcr.io').href : null
  }
  return tags
}

// docker hub tags are filtered by the current major (e.g. "8."), mongo majors are followed by hand
async function dockerHubTags (image: string, prefix: string): Promise<string[]> {
  const name = image.includes('/') ? image : `library/${image}`
  const res = await fetch(`https://hub.docker.com/v2/repositories/${name}/tags?page_size=100&name=${prefix}`)
  if (!res.ok) throw new Error(`docker hub tags ${name}: ${res.status}`)
  return ((await res.json()) as { results: { name: string }[] }).results.map(r => r.name)
}

export const fetchTags = (s: Service, currentVersion?: string): Promise<string[]> =>
  s.registry === 'ghcr' ? ghcrTags(s.image) : dockerHubTags(s.image, (currentVersion ?? '').split('.')[0] + '.')

// a file of a service repository at a released version (git tags are "v1.2.3", some older ones "1.2.3")
// null when the file does not exist, errors other than 404 are thrown to not be mistaken for a missing file
export async function fetchRepoFile (repo: string, version: string, path: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  for (const ref of [`v${version}`, version]) {
    const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`
    const res = await fetchImpl(url)
    if (res.ok) return res.text()
    if (res.status !== 404) throw new Error(`${url}: ${res.status}`)
  }
  return null
}
