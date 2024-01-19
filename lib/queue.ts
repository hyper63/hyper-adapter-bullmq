// deno-lint-ignore-file no-explicit-any
import { crocks, cuid, HyperErr, R } from '../deps.ts'
import type { Queue as _Queue, Redis } from '../types.ts'
import { createJobKey, createStoreKey, trampoline } from './utils.ts'

const { Async } = crocks
const { map } = R

type WithRedis = { redis: Redis }
type WithQueueArgs = WithRedis & { queue: _Queue }

type Job = {
  id: string
  data: Record<string, any>
  error?: any
}

export const Queue = (prefix: string) => {
  function checkQueueExists(redis: Redis, name: string) {
    return Async.of(createStoreKey(prefix, name))
      .chain(Async.fromPromise((key) => redis.get(key)))
      .chain((v) =>
        v
          ? Async.Resolved(v)
          : Async.Rejected(HyperErr({ status: 404, msg: 'Queue Does Not Exist' }))
      )
  }

  function getKeys(redis: Redis, matcher: string, count: number) {
    function page(
      [cursor, keys]: [string | number, string[]],
    ): Promise<string[] | (() => Promise<string[]>)> {
      if (cursor === '0') return Async.of(keys).toPromise()

      return Async.fromPromise(() => redis.scan(cursor, 'MATCH', matcher, 'COUNT', count))()
        .map(([nCursor, nKeys]) => {
          keys = keys.concat(nKeys)

          /**
           * Return a thunk that continues the next iteration, thus ensuring the callstack
           * is only ever one call deep.
           *
           * This is continuation passing style, to be leverage by our trampoline
           */
          return (() => page([nCursor, keys])) as () => Promise<string[]>
        }).toPromise()
    }

    /**
     * Our initial thunk that performs the first scan
     */
    return Async.fromPromise(page)([0, []])
      .chain(Async.fromPromise(trampoline))
  }

  function getValues(mget: Redis['mget'], count: number) {
    return function (keys: string[]) {
      function page(
        keys: string[],
        values: Record<string, any>[],
      ): Promise<Record<string, any>[] | (() => Promise<Record<string, any>[]>)> {
        if (!keys.length) return Async.of(values).toPromise()

        return Async.of(keys.splice(0, count))
          /**
           * We are using hash slots, so all keys for a store will be mapped
           * to a single hash slot and so can be retrieved as a set.
           *
           * Regardless, we still break up the operations into "pages" according
           * to the provided count, so as to not block the Redis thread for too long
           * on any given operation
           */
          .chain(Async.fromPromise((nKeys) => mget(nKeys)))
          .map((nValues) => {
            values = values
              .concat(nValues.map((v) => v ? JSON.parse(v) : v))
              .filter((v) => !!v)

            /**
             * Return a thunk that continues the next iteration, thus ensuring the callstack
             * is only ever one call deep.
             *
             * This is continuation passing style, to be leverage by our trampoline
             */
            return (() => page(keys, values)) as () => Promise<Record<string, any>[]>
          }).toPromise()
      }

      /**
       * Our initial thunk that performs the first scan
       */
      return Async.fromPromise(() => page(keys, []))()
        .chain(Async.fromPromise(trampoline))
        .map((values) => values)
    }
  }

  function deleteKeys(redis: Redis, count: number) {
    return function (keys: string[]) {
      function page(keys: string[]): Promise<unknown[] | (() => Promise<unknown[]>)> {
        if (!keys.length) return Async.of([]).toPromise()

        return Async.of(keys.splice(0, count))
          /**
           * We are using hash slots, so all keys for a store will be mapped
           * to a single hash slot and so can be deleted as a set.
           *
           * Regardless, we still break up the operations into "pages" according
           * to the provided count, so as to not block the Redis thread for too long
           * on any given operation
           */
          .chain(Async.fromPromise((nKeys) => redis.del(nKeys)))
          /**
           * Return a thunk that continues the next iteration, thus ensuring the callstack
           * is only ever one call deep.
           *
           * This is continuation passing style, to be leverage by our trampoline
           */
          .map(() => (() => page(keys)) as () => Promise<unknown[]>)
          .toPromise()
      }

      /**
       * Our initial thunk that performs the first scan
       */
      return Async.of(keys)
        .chain(Async.fromPromise(page))
        .chain(Async.fromPromise(trampoline))
    }
  }

  function getJob(
    { redis, name, id, status }: {
      redis: Redis
      name: string
      id: string
      status: 'READY' | 'ERROR'
    },
  ) {
    return checkQueueExists(redis, name)
      .chain(Async.fromPromise((_) => redis.get(createJobKey(prefix, name, status, id))))
      .chain((job) =>
        job
          ? Async.Resolved(JSON.parse(job))
          : Async.Rejected(HyperErr({ status: 404, 'msg': 'job not found' }))
      )
      .map((job) => job as Job)
  }

  const all = ({ redis }: WithRedis) => () => {
    return Async.of(createStoreKey(prefix, '*'))
      .chain((matcher) => getKeys(redis, matcher, 50))
      .chain(getValues(redis.mget.bind(redis), 50))
      .map((values) => values.map((value) => value.name))
  }

  const create =
    ({ redis }: WithRedis) =>
    ({ name, target, secret }: { name: string; target: string; secret?: string }) => {
      return checkQueueExists(redis, name)
        .bichain(
          () =>
            Async.of(createStoreKey(prefix, name))
              .chain(
                Async.fromPromise((key) =>
                  redis.set(key, JSON.stringify({ name, target, secret }))
                ),
              ),
          () => Async.Rejected(HyperErr({ status: 409, msg: 'Queue Already Exists' })),
        )
    }

  const destroy = ({ redis }: WithRedis) => (name: string) => {
    return checkQueueExists(redis, name)
      /**
       * Find any keys for jobs on the hyper queue and the hyper queue metadata key, itself
       *
       * eg. prefix_store_{foo-queue}*
       */
      .chain(() => getKeys(redis, `${createStoreKey(prefix, name)}*`, 100))
      .chain(deleteKeys(redis, 100))
  }

  const enqueue =
    ({ redis, queue }: WithQueueArgs) =>
    ({ name, job }: { name: string; job: Record<string, unknown> }) => {
      return checkQueueExists(redis, name)
        .map(() => cuid())
        /**
         * Set the name of the job to name of the queue, so that it
         * can be used to lookup the queue metadata when the job is processed
         */
        .chain(Async.fromPromise((jobId) => queue.add(name, job, { jobId })))
        .chain(Async.fromPromise(async (job) => {
          /**
           * Create a key to track this job as ready in the hyper queue
           *
           * This will be removed when the job begins processing, so no TTL is included
           */
          await redis.set(
            createJobKey(prefix, name, 'READY', job.id as string),
            JSON.stringify({ id: job.id, data: job.data }),
          )

          return job
        }))
        .map((job) => ({ id: job.id as string, data: job.data }))
    }

  const jobs = ({ redis }: WithQueueArgs) =>
  (
    { name, status }: { name: string; status: 'READY' | 'ERROR' },
  ) => {
    return checkQueueExists(redis, name)
      /**
       * Find all job keys based on status, using a wildcard for the job id.
       *
       * This should find all the jobs on the hype queue with that status
       */
      .chain(() => getKeys(redis, createJobKey(prefix, name, status, '*'), 100))
      .chain(getValues(redis.mget.bind(redis), 100))
      .map(
        map((job) => ({
          id: job.id as string,
          status,
          job: job.data,
          error: job.error,
        })),
      )
  }

  const retry = ({ redis, queue }: WithQueueArgs) => {
    const reenqueue = enqueue({ redis, queue })

    return ({ name, id }: { name: string; id: string }) => {
      return getJob({ redis, name, id, status: 'ERROR' })
        .chain((job) =>
          Async.of(job)
            /**
             * We know the job exists, so enqueue it,
             * and also remove the key used to track it's status
             */
            .chain(Async.fromPromise((job) =>
              Promise.all([
                redis.del(createJobKey(prefix, name, 'ERROR', id)),
                reenqueue({ name, job: job.data }).toPromise(),
              ])
            ))
            .map(([, newJob]) => newJob)
        )
        .map((newJob) => ({ id: newJob.id as string }))
    }
  }

  const cancel =
    ({ redis, queue }: WithQueueArgs) => ({ name, id }: { name: string; id: string }) => {
      return getJob({ redis, name, id, status: 'READY' })
        .chain((job) =>
          Async.of(job)
            /**
             * We know the job exists, so remove it from the queue,
             * and also remove the key used to track it's status
             */
            .chain(Async.fromPromise((job) =>
              Promise.all([
                queue.remove(job.id as string),
                redis.del(createJobKey(prefix, name, 'READY', id)),
              ])
            ))
            /**
             * A job was found, but then not found for removal, so something else removed it,
             * so just resolve back to the happy path
             */
            .bichain(Async.Resolved, Async.Resolved)
            .map(() => ({ id: job.id as string }))
        )
    }

  const close = ({ queue }: WithQueueArgs) => () => queue.close()

  return {
    all,
    create,
    destroy,
    enqueue,
    jobs,
    retry,
    cancel,
    close,
  }
}
