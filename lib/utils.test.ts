import { assertEquals } from '../dev_deps.ts'

import { createJobKey, createQueueKey } from './utils.ts'

Deno.test('utils', async (t) => {
  await t.step('createStoreKey', async (t) => {
    await t.step('should create the key', () => {
      assertEquals(createQueueKey('prefix', 'foo-queue'), 'prefix_queue_{foo-queue}')
    })
  })

  await t.step('createJobKey', async (t) => {
    await t.step('should create the key, appending the parts', () => {
      assertEquals(
        createJobKey('prefix', 'foo-queue', 'READY', 'foo-123'),
        'prefix_queue_{foo-queue}_job_READY_foo-123',
      )
    })
  })
})
