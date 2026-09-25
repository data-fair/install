import { test, expect } from '@playwright/test'

test('node runs typescript directly', () => {
  const n: number = 1
  expect(n).toBe(1)
})
