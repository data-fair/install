import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SERVICES, type ValidatedVersions } from './lib/services.ts'
import { latestVersion, extractEnvNames, requiredPaths, diffSets, bumpKind } from './lib/versions.ts'
import { fetchTags, fetchRepoFile } from './lib/registries.ts'
import { computeFindings, renderReport, type FileDiff } from './lib/drift.ts'
import { syncIssue } from './lib/github-issue.ts'

const root = resolve(import.meta.dirname, '..')
const vPath = resolve(root, 'validated-versions.json')
const validated: ValidatedVersions | null = existsSync(vPath) ? JSON.parse(await readFile(vPath, 'utf8')) : null

const latest: Record<string, string | null> = {}
const fileDiffs: Record<string, FileDiff[]> = {}

async function diffFile (repo: string, from: string, to: string, path: string): Promise<FileDiff> {
  const diff: FileDiff = { path, missing: false, envAdded: [], envRemoved: [], requiredAdded: [] }
  try {
    const [before, after] = await Promise.all([fetchRepoFile(repo, from, path), fetchRepoFile(repo, to, path)])
    if (after === null) return { ...diff, missing: true }
    if (path.endsWith('.json')) {
      diff.requiredAdded = diffSets(before ? requiredPaths(JSON.parse(before)) : [], requiredPaths(JSON.parse(after))).added
    } else {
      const { added, removed } = diffSets(before ? extractEnvNames(before) : [], extractEnvNames(after))
      diff.envAdded = added
      diff.envRemoved = removed
    }
    return diff
  } catch (err: any) {
    // network errors, rate limits, unparsable files: reported, never fatal for the whole check
    return { ...diff, error: err.message }
  }
}

if (validated) {
  for (const s of SERVICES) {
    const current = validated.versions[s.key]
    try {
      latest[s.key] = latestVersion(await fetchTags(s, current), s.registry === 'dockerhub' ? current : undefined)
    } catch (err: any) {
      console.error(`${s.key}: ${err.message}`)
      latest[s.key] = null
    }
    const to = latest[s.key]
    if (!current || !to || !s.repo || bumpKind(current, to) === 'none') continue
    fileDiffs[s.key] = await Promise.all((s.configFiles ?? []).map(path => diffFile(s.repo!, current, to, path)))
  }
}

const findings = computeFindings({ validated, latest, fileDiffs })
console.log(renderReport(findings))

if (process.argv.includes('--github-issue')) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required with --github-issue')
  const result = await syncIssue({ token, repo, title: 'Install docs drift', body: findings.length ? renderReport(findings) : null })
  console.log(`drift issue: ${result}`)
}
