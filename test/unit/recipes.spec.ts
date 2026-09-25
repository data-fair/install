import { test, expect } from '@playwright/test'
import { composeFiles, parseVariantArgs, testEnvOverrides } from '../../scripts/lib/recipes.ts'

test('compose files per variant', () => {
  expect(composeFiles('local', { test: true })).toEqual(['compose.yaml'])
  expect(composeFiles('production', { test: false })).toEqual(['compose.yaml'])
  expect(composeFiles('production', { test: true })).toEqual(['compose.yaml', '../../test/production.override.yaml'])
  expect(composeFiles('production+bonus', { test: true })).toEqual(['compose.yaml', 'compose.bonus.yaml', '../../test/production.override.yaml'])
})

test('parseVariantArgs', () => {
  expect(parseVariantArgs(['local'])).toEqual({ variant: 'local', keep: false })
  expect(parseVariantArgs(['production', '--bonus', '--keep'])).toEqual({ variant: 'production+bonus', keep: true })
  expect(() => parseVariantArgs(['local', '--bonus'])).toThrow(/bonus/)
  expect(() => parseVariantArgs([])).toThrow(/usage/)
})

test('production test overrides point to localhost over http', () => {
  expect(testEnvOverrides('production')).toMatchObject({ DOMAIN: 'localhost', BASE_URL: 'http://localhost' })
  expect(testEnvOverrides('local')).toEqual({})
})
