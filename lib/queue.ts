// deno-lint-ignore-file no-explicit-any
import { crocks, cuid, HyperErr, R } from '../deps.ts'
import type { Job, JobType, Queue as _Queue, Redis } from '../types.ts'
import { createStoreKey } from './utils.ts'

const { Async } = crocks
const { always, cond, equals, map, omit } = R

type WithRedis = { redis: Redis }
type WithQueueArgs = WithRedis & { queue: _Queue }

export const Queue = (prefix: string) => {
  const checkQueueExists = ({ redis }: WithRedis) => (name: string) =>
    Async.of(createStoreKey(prefix, name))
      .chain(Async.fromPromise((key) => redis.get(key)))
      .chain((v) =>
        v
          ? Async.Resolved(v)
          : Async.Rejected(HyperErr({ status: 404, msg: 'Queue Does Not Exist' }))
      )

  const getJob =
    ({ redis, queue }: WithQueueArgs) => ({ name, id }: { name: string; id: string }) => {
      const client = { checkQueueExists: checkQueueExists({ redis }) }

      return client.checkQueueExists(name)
        .chain(Async.fromPromise((_) => queue.getJob(id)))
        .chain((job) =>
          job
            ? Async.Resolved(job)
            : Async.Rejected(HyperErr({ status: 404, 'msg': 'job not found' }))
        )
        .map((job) => job as Job)
    }

  const all = ({ redis }: WithRedis) => () => {
    function getKeys(scan: typeof redis.scan, matcher: string, count: number) {
      function next([cursor, keys]: Awaited<ReturnType<typeof scan>>): Promise<string[]> {
        return cursor === '0'
          ? Async.Resolved(keys).toPromise()
          : Async.fromPromise(() => scan(cursor, 'MATCH', matcher, 'COUNT', count))()
            .chain(next as any)
            .map((v) => keys.concat(v as string[]))
            .toPromise()
      }

      return scan(0, 'MATCH', matcher, 'COUNT', count).then(next)
    }

    return Async.of(createStoreKey(prefix, '*'))
      .chain(Async.fromPromise((matcher) => getKeys(redis.scan.bind(redis), matcher, 50)))
  }

  const create =
    ({ redis }: WithRedis) =>
    ({ name, target, secret }: { name: string; target: string; secret?: string }) => {
      const client = { checkQueueExists: checkQueueExists({ redis }) }

      return client.checkQueueExists(name)
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
    const client = { checkQueueExists: checkQueueExists({ redis }) }

    return client.checkQueueExists(name)
      .map(() => createStoreKey(prefix, name))
      .chain(Async.fromPromise((key) => redis.del(key)))
  }

  const enqueue =
    ({ redis, queue }: WithQueueArgs) =>
    ({ name, job }: { name: string; job: Record<string, unknown> }) => {
      const client = { checkQueueExists: checkQueueExists({ redis }) }

      return client.checkQueueExists(name)
        .map(() => cuid())
        /**
         * Set the name of the job to name of the queue, so that it
         * can be used to lookup the queue metadata when the job is processed
         */
        .chain(Async.fromPromise((jobId) => queue.add(name, job, { jobId })))
        .map((job) => ({ id: job.id as string, data: job.data }))
    }

  const jobs =
    ({ redis, queue }: WithQueueArgs) =>
    ({ name, status }: { name: string; status: 'READY' | 'ERROR' }) => {
      const client = { checkQueueExists: checkQueueExists({ redis }) }

      return client.checkQueueExists(name)
        .map(() => status)
        .map(cond<any, JobType[]>([
          [equals('READY'), always(['waiting', 'waiting-children', 'delayed'])],
          [equals('ERROR'), always(['failed'])],
        ]))
        .chain(Async.fromPromise((jobTypes) => queue.getJobs(jobTypes)))
        .map(map((job) => ({ id: job.id as string, status, job: job.data })))
    }

  const retry =
    ({ redis, queue }: WithQueueArgs) => ({ name, id }: { name: string; id: string }) => {
      const client = { getJob: getJob({ redis, queue }) }

      return client.getJob({ name, id })
        .chain((job) =>
          Async.of(job)
            .chain(Async.fromPromise((job) => queue.remove(job.id as string)))
            /**
             * A job was found, but then not found for removal, so something else removed it,
             * so just resolve back to the happy path
             */
            .bichain(Async.Resolved, Async.Resolved)
            .map(() => job)
            /**
             * Before requeuing the job, we make sure to remove, from the payload,
             * the error key that was used to record the previous runs error
             *
             * (See worker.ts process() where the error key is conditionally added)
             */
            .chain(
              Async.fromPromise((job) => queue.add(name, omit(['error', job.data]), { jobId: id })),
            )
            .map((job) => ({ id: job.id as string }))
        )
    }

  const cancel =
    ({ redis, queue }: WithQueueArgs) => ({ name, id }: { name: string; id: string }) => {
      const client = { getJob: getJob({ redis, queue }) }

      return client.getJob({ name, id })
        .chain((job) =>
          Async.of(job)
            .chain(Async.fromPromise((job) => queue.remove(job.id as string)))
            /**
             * A job was found, but then not found for removal, so something else removed it,
             * so just resolve back to the happy path
             */
            .bichain(Async.Resolved, Async.Resolved)
            .map(() => ({ id: job.id as string }))
        )
    }

  return {
    all,
    create,
    destroy,
    enqueue,
    jobs,
    retry,
    cancel,
  }
}
