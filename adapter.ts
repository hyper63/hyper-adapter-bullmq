import { crocks, isHyperErr, R } from './deps.ts'
import type { ImplConfig } from './types.ts'

import { Queue } from './lib/queue.ts'
import { Worker } from './lib/worker.ts'

const { Async } = crocks
const { always, ifElse } = R

const handleHyperErr = ifElse(
  isHyperErr,
  Async.Resolved,
  Async.Rejected,
)

export function adapter(
  {
    fetch,
    queueRedisClient,
    workerRedisClient,
    createQueue,
    createWorker,
    concurrency,
    failedTtl,
    keyPrefix,
  }: ImplConfig,
) {
  const $queue = (() => {
    const queue = Queue(keyPrefix)
    const queueClient = createQueue({ redisClient: queueRedisClient, keyPrefix })
    Deno.addSignalListener('SIGINT', queue.close({ redis: queueRedisClient, queue: queueClient }))

    return {
      all: queue.all({ redis: queueRedisClient }),
      create: queue.create({ redis: queueRedisClient }),
      destroy: queue.destroy({ redis: queueRedisClient }),
      enqueue: queue.enqueue({ redis: queueRedisClient, queue: queueClient }),
      jobs: queue.jobs({ redis: queueRedisClient, queue: queueClient }),
      retry: queue.retry({ redis: queueRedisClient, queue: queueClient }),
      cancel: queue.cancel({ redis: queueRedisClient, queue: queueClient }),
    }
  })() /**
   * Create workers according to the desired concurrency
   */
  ;(() => {
    const worker = Worker(keyPrefix)
    const processor = worker.process({ redis: queueRedisClient, fetch, failedTtl })
    Array(concurrency).fill(0).map(() => {
      const workerClient = createWorker({
        redisClient: workerRedisClient,
        processor,
        keyPrefix,
      })
      Deno.addSignalListener('SIGINT', worker.close({ worker: workerClient }))
    })
  })()

  function index() {
    return $queue.all()
      .map((queues) => ({ ok: true, queues }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function create({ name, target, secret }: { name: string; target: string; secret?: string }) {
    return Async.of({ name, target, secret })
      .chain($queue.create)
      .map(always({ ok: true }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function destroy(name: string) {
    return Async.of(name)
      .chain($queue.destroy)
      .map(always({ ok: true }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function post({ name, job }: { name: string; job: Record<string, unknown> }) {
    return Async.of({ name, job })
      .chain($queue.enqueue)
      .map((job) => ({ ok: true, id: job.id }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function get({ name, status }: { name: string; status: 'READY' | 'ERROR' }) {
    return Async.of({ name, status })
      .chain($queue.jobs)
      .map((jobs) => ({ ok: true, jobs }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function retry({ name, id }: { name: string; id: string }) {
    return Async.of({ name, id })
      .chain($queue.retry)
      .map(() => ({ ok: true, id }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  function cancel({ name, id }: { name: string; id: string }) {
    return Async.of({ name, id })
      .chain($queue.cancel)
      .map(() => ({ ok: true, id }))
      .bichain(handleHyperErr, Async.Resolved)
      .toPromise()
  }

  return Object.freeze({
    index,
    create,
    delete: destroy,
    post,
    get,
    retry,
    cancel,
  })
}
