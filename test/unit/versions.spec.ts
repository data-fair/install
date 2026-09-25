import { test, expect } from '@playwright/test'
import { parseSemver, latestVersion, bumpKind, extractEnvNames, requiredPaths, diffSets } from '../../scripts/lib/versions.ts'

test('parseSemver', () => {
  expect(parseSemver('6.20.0')).toEqual([6, 20, 0])
  expect(parseSemver('v6.20.0')).toEqual([6, 20, 0])
  expect(parseSemver('6')).toBeNull()
  expect(parseSemver('master')).toBeNull()
  expect(parseSemver('6.20.0-beta.1')).toBeNull()
})

test('latestVersion ignores non semver tags and can stay in a major', () => {
  const tags = ['6', 'master', '6.9.0', '6.20.0', '7.0.0', '8.0.17', 'latest']
  expect(latestVersion(tags)).toBe('8.0.17')
  expect(latestVersion(tags, '6.1.0')).toBe('6.20.0')
  expect(latestVersion(['main'])).toBeNull()
})

test('bumpKind', () => {
  expect(bumpKind('6.1.0', '6.1.0')).toBe('none')
  expect(bumpKind('6.1.0', '6.1.3')).toBe('patch')
  expect(bumpKind('6.1.0', '6.2.0')).toBe('minor')
  expect(bumpKind('6.1.0', '7.0.0')).toBe('major')
  expect(bumpKind('6.2.0', '6.1.0')).toBe('none')
})

test('extractEnvNames reads custom-environment-variables files in any format', () => {
  const cjs = "module.exports = { port: 'PORT', a: { __name: 'A_JSON', __format: 'json' }, b: jsonEnv('B_LIST') }"
  expect(extractEnvNames(cjs)).toEqual(['A_JSON', 'B_LIST', 'PORT'])
})

test('extractEnvNames reads the runtimeConfig keys of a nuxt config', () => {
  const nuxt = "export default defineNuxtConfig({\n  runtimeConfig: {\n    mongoUrl: 'x',\n    portalUrlPattern: ''\n  },\n  security: { nonce: true }\n})"
  expect(extractEnvNames(nuxt)).toEqual(['NUXT_MONGO_URL', 'NUXT_PORTAL_URL_PATTERN'])
})

test('requiredPaths walks nested properties', () => {
  const schema = { required: ['a', 'b'], properties: { b: { type: 'object', required: ['c'], properties: { c: {} } } } }
  expect(requiredPaths(schema)).toEqual(['a', 'b', 'b.c'])
})

test('diffSets', () => {
  expect(diffSets(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'] })
})

test('extractEnvNames ignores the values of a nuxt runtimeConfig (urls contain colons)', () => {
  const nuxt = "  runtimeConfig: {\n    mainPublicUrl: 'http://localhost:5610',\n    privateDirectoryUrl: 'http://simple-directory:8081',\n    mongoUrl: 'mongodb://localhost:27022/data-fair-portals',\n    portalUrlPattern: ''\n  },"
  expect(extractEnvNames(nuxt)).toEqual(['NUXT_MAIN_PUBLIC_URL', 'NUXT_MONGO_URL', 'NUXT_PORTAL_URL_PATTERN', 'NUXT_PRIVATE_DIRECTORY_URL'])
})
