import { crocks } from '../deps.ts'
import type { Job, Redis, Worker as _Worker } from '../types.ts'
import { computeSignature, createJobKey, createStoreKey } from './utils.ts'

const { Async } = crocks

type Deps = {
  redis: Redis
  fetch: typeof fetch
  failedTtl: number
}

type WithWorker = {
  worker: _Worker
}

export const Worker = (prefix: string) => {
  const process = ({ redis, fetch, failedTtl }: Deps) => (job: Job) => {
    /**
     * We first immediately remove the READY key for the job, since
     * it's began processing
     */
    return Async.of(createJobKey(prefix, job.name, 'READY', job.id as string))
      .chain(Async.fromPromise((jobKey) => redis.del(jobKey)))
      /**
       * The job name is the same as the hyper queue name
       * so we can use it to look up the queue metadata
       */
      .map(() => createStoreKey(prefix, job.name))
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
          body: JSON.stringify(job.data),
        })
      }))
      .bichain(
        // Error
        // @ts-ignore crocks types do be annoying
        (err: Error) => {
          return Async.of(JSON.stringify({ msg: err.message, stack: err.stack }))
            /**
             * A network error that fetch threw directly
             *
             * So we add this as the error for the job, creating an error
             * key and storing the data for the configured failedTtl
             */
            .chain(
              Async.fromPromise((txt) =>
                redis.set(
                  createJobKey(prefix, job.name, 'ERROR', job.id as string),
                  JSON.stringify({ id: job.id, data: job.data, error: txt }),
                  'EX',
                  failedTtl,
                )
              ),
            )
            .chain(() => Async.Resolved(err))
        },
        // Response
        (res) => {
          return res.ok
            ? Async.Resolved(res)
            /**
             * A non-ok status code, so assume an error
             *
             * So we add this as the error for the job, creating an error
             * key and storing the data for the configured failedTtl
             */
            : Async.of(res)
              .chain(Async.fromPromise((res) => res.text()))
              .chain(Async.fromPromise((txt) =>
                redis.set(
                  createJobKey(prefix, job.name, 'ERROR', job.id as string),
                  JSON.stringify({ id: job.id, data: job.data, error: txt }),
                  'EX',
                  failedTtl,
                )
              ))
              .chain(() => Async.Resolved(res))
        },
      )
      .toPromise()
  }

  const close = ({ worker }: WithWorker) => () => worker.close()

  return { process, close }
}
