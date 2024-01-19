// deno-lint-ignore-file no-explicit-any require-await
import { assert, assertEquals, assertObjectMatch } from '../dev_deps.ts'

import { adapter } from '../adapter.ts'
import { ImplConfig } from '../types.ts'

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>

export const suite = (
  t: Deno.TestContext,
  { queue = 'jobs', job, target }: { queue?: string; job: Record<string, any>; target: string },
) =>
async (
  config: Optional<ImplConfig, 'fetch'>,
  options: { shouldBaseLine: boolean } = { shouldBaseLine: false },
) => {
  /**
   * This will allow us to mock fetch, so we can
   * assert calls to a worker endpoint, without actually sending calls across the network
   */
  let innerMockFetch = async (_url: string, _options: any) =>
    new Response(JSON.stringify({ ok: false, msg: 'Not Implemented ' }), { status: 501 })

  const mockFetch = (url: string, options: any) => innerMockFetch(url, options)

  config.fetch = config.fetch || mockFetch as typeof fetch

  const isMockFetch = config.fetch === mockFetch
  const a = adapter(config as ImplConfig)

  /**
   * We may need to baseline our test suite by deleting the queue under
   * test. This step does just that, idempotently
   */
  await t.step('baseline', async () => {
    if (!options.shouldBaseLine) return assert(true)

    const res = await a.delete(queue).then((res: any) => {
      /**
       * Database does not exist, so nothing to baseline
       */
      if (res.status === 404) return { ok: true }
      return res
    })

    assert((res as any).ok)
  })

  await t.step('index', async (t) => {
    await t.step('should return an emtpy array if no queues exist', async () => {
      const res = await a.index()
      assertObjectMatch(res as any, { ok: true, queues: [] })
    })

    await t.step('should return all queues', async () => {
      await a.create({ name: 'foobar', target })
      await a.create({ name: 'fizzbuzz', target })

      const res = await a.index()
      assertObjectMatch(res as any, { ok: true, queues: ['fizzbuzz', 'foobar'] })

      await Promise.all([
        a.delete('foobar'),
        a.delete('fizzbuzz'),
      ])
    })
  })

  await t.step('create', async (t) => {
    await t.step('should create the queue', async () => {
      const res = await a.create({ name: queue, target })
      assertObjectMatch(res as any, { ok: true })

      await a.delete(queue)
    })

    await t.step('should return a HyperErr(409) if the queue already exists', async () => {
      await a.create({ name: queue, target })

      const res = await a.create({ name: queue, target })
      assertObjectMatch(res as any, { ok: false, status: 409 })

      await a.delete(queue)
    })
  })

  await t.step('delete', async (t) => {
    await t.step('should delete the queue', async () => {
      await a.create({ name: queue, target })

      const res = await a.delete(queue)
      assertObjectMatch(res as any, { ok: true })
    })

    await t.step('should remove job data when deleting the queue', async () => {
      await a.create({ name: queue, target, secret: 'foobar' })

      let worker = Promise.resolve()

      /**
       * Return an error from the worker, so that the adapter
       * will create an error key for the DLQ
       */
      if (isMockFetch) {
        worker = new Promise((resolve) => {
          innerMockFetch = async () => {
            resolve(undefined)
            return new Response('Woops', { status: 422 })
          }
        })
      }

      await a.post({ name: queue, job })
      await worker

      /**
       * Deleting the queue should also remove the ERROR key for the
       * job above.
       *
       * So delete the queue, recreate it, and confirm that it's DLQ
       * is empty
       */
      await a.delete(queue)
      await a.create({ name: queue, target, secret: 'foobar' })
      const jobRes = await a.get({ name: queue, status: 'ERROR' })
      assertObjectMatch(jobRes as any, { ok: true, jobs: [] })

      await a.delete(queue)
    })

    await t.step('should return a HyperErr(404) if the queue does not exist', async () => {
      const res = await a.delete(queue)
      assertObjectMatch(res as any, { ok: false, status: 404 })
    })
  })

  await t.step('post', async (t) => {
    await t.step('should post the job to the worker', async () => {
      await a.create({ name: queue, target, secret: 'foobar' })

      let worker = Promise.resolve()

      /**
       * Use mock fetch to assert the data sent to the
       * worker
       */
      if (isMockFetch) {
        worker = new Promise((resolve) => {
          innerMockFetch = async (url: string, options: any) => {
            assertEquals(url, target)
            assertEquals(options.method, 'POST')
            assertEquals(JSON.parse(options.body), job)
            assertEquals(options.headers['Content-Type'], 'application/json')
            assert(options.headers['X-HYPER-SIGNATURE'])

            resolve(undefined)

            return new Response('OK', { status: 200 })
          }
        })
      }

      const res = await a.post({ name: queue, job })

      assert((res as any).ok)
      assert((res as any).id)
      await worker

      await a.delete(queue)
    })
  })
}
