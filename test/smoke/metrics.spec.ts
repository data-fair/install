import { test, expect } from '@playwright/test'
import { setTimeout as sleep } from 'node:timers/promises'
import { createDataset, variant } from './support.ts'

test.skip(variant === 'local', 'metrics are only part of the production recipe')

test('nginx logs reach the metrics daemon', async ({ request }) => {
  const id = await createDataset(request, 'Metrics smoke')
  for (let i = 0; i < 5; i++) await request.get(`/data-fair/api/v1/datasets/${id}/lines`)
  for (let i = 0; i < 30; i++) {
    const res = await request.get('/metrics/api/daily-api-metrics')
    expect(res.ok(), await res.text()).toBeTruthy()
    if ((await res.json()).count > 0) return
    await sleep(3000)
  }
  throw new Error('no metrics aggregated from nginx logs')
})
