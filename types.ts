import type { Cluster, Job, JobType, Queue, Redis as _Redis, Worker } from './deps.ts'

export type Redis = _Redis | Cluster

export { Job, JobType, Queue, Worker }

export type AdapterConfig = {
  url: string
  options?: {
    concurrency?: number
    failedTtl?: number
    keyPrefix?: string
    cluster?: boolean
  }
}

export type ImplConfig = {
  redisClient: Redis | Cluster
  fetch: typeof fetch
  createQueue: (args: { redisClient: ImplConfig['redisClient']; keyPrefix: string }) => Queue
  createWorker: (
    args: {
      redisClient: ImplConfig['redisClient']
      failedTtl: number
      processor: Worker['processFn']
    },
  ) => Worker
  concurrency: number
  failedTtl: number
  keyPrefix: string
}