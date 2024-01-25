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
  redis: {
    client: Redis | Cluster
    host: string
    port: number
    password?: string
  }
  fetch: typeof fetch
  createQueue: (args: { host: string; port: number; password?: string; keyPrefix: string }) => Queue
  createWorker: (
    args: {
      host: string
      port: number
      password?: string
      processor: Worker['processFn']
      keyPrefix: string
    },
  ) => Worker
  concurrency: number
  failedTtl: number
  keyPrefix: string
}
