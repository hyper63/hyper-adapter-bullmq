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
  queueClient: Queue
  workerClient: Worker
  concurrency: number
  failedTtl: number
  keyPrefix: string
}
