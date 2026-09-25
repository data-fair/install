import { test, expect } from '@playwright/test'
import { composeFiles, parseVariantArgs, testEnvOverrides, mongoKernelWorkaround } from '../../scripts/lib/recipes.ts'

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

test('production test overrides point to a *.localhost host over http', () => {
  expect(testEnvOverrides('production')).toMatchObject({ DOMAIN: 'datafair.localhost', BASE_URL: 'http://datafair.localhost' })
  expect(testEnvOverrides('local')).toEqual({})
})

test('mongo image workaround only on kernels affected by SERVER-121912', () => {
  expect(mongoKernelWorkaround('6.8.0-45-generic')).toBeNull()
  expect(mongoKernelWorkaround('6.12.1')).toBeNull()
  expect(mongoKernelWorkaround('6.19.2')).toBe('mongo:8.0.17')
  expect(mongoKernelWorkaround('7.0.0-31-generic')).toBe('mongo:8.0.17')
  expect(mongoKernelWorkaround('7.0.13')).toBe('mongo:8.0.17')
  expect(mongoKernelWorkaround('7.0.14')).toBeNull()
  expect(mongoKernelWorkaround('7.1.0')).toBeNull()
})

test('bonus test overrides provide a placeholder data-fair API key (the workers require one to start)', () => {
  expect(testEnvOverrides('production+bonus').DATA_FAIR_API_KEY).toBe('not-provisioned')
  expect(testEnvOverrides('production').DATA_FAIR_API_KEY).toBeUndefined()
})
