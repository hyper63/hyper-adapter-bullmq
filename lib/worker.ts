import { crocks } from '../deps.ts'
import type { Job, Redis, Worker as _Worker } from '../types.ts'
import { computeSignature, createStoreKey } from './utils.ts'

const { Async } = crocks

type Deps = {
  redis: Redis
  fetch: typeof fetch
}

type WithWorker = {
  worker: _Worker
}

export const Worker = (prefix: string) => {
  const process = ({ redis, fetch }: Deps) => (job: Job) =>
    /**
     * The job name is the same as the hyper queue name
     * so we can use it to look up the queue metadata
     */
    Async.of(createStoreKey(prefix, job.name))
      .chain(Async.fromPromise((key) => redis.get(key)))
      .map((res) => JSON.parse(res as string) as { target: string; secret: string })
      .chain(Async.fromPromise(({ target, secret }) => {
        const timeInMilli = new Date().getTime()
        // fetch
        return fetch(target, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret
              ? {
                'X-HYPER-SIGNATURE': `t=${timeInMilli},sig=${
                  computeSignature(secret, job.data, timeInMilli)
                }`,
              }
              : {}),
          },
          body: JSON.stringify(job),
        })
      }))
      .chain((res) => res.ok ? Async.Resolved(res) : Async.Rejected(res))
      .toPromise()

  const close = ({ worker }: WithWorker) => () => worker.close()

  return { process, close }
}
