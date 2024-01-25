import { suite } from './test/suite.ts'

import bullmq from './mod.ts'

Deno.test({
  name: 'BullMQ Adapter Test Suite - Integration',
  fn: async (t) => {
    const url = Deno.env.get('REDIS_URL')
    if (!url) {
      throw new Error('Redis connection string is required at REDIS_URL')
    }

    const JOB = { type: 'FOOBAR', payload: { id: 1 } }

    /**
     * Load configuration
     */
    const {
      redis,
      createQueue,
      createWorker,
      concurrency,
      failedTtl,
      keyPrefix,
    } = await bullmq({ url, options: { keyPrefix: 'integration' } }).load()

    /**
     * Execute the test suite, injecting our configuration
     */
    await suite(t, { target: 'http://localhost:3000/hooks/jobs', job: JOB })({
      redis,
      /**
       * Mock fetch in the test suite
       */
      fetch: undefined,
      createQueue,
      createWorker,
      concurrency,
      failedTtl,
      keyPrefix,
    }, { shouldBaseLine: true })
  },
  /**
   * We ignore sanitization of resources
   * and ops, when running integration tests,
   * so connections can be lazily destroyed
   *
   * See https://deno.com/manual/basics/testing/sanitizers
   */
  sanitizeOps: false,
  sanitizeResources: false,
})
