// deno-lint-ignore-file no-explicit-any
import { Cluster, crocks, Queue, R, Redis, Worker } from './deps.ts'

import PORT_NAME from './port_name.ts'
import { adapter } from './adapter.ts'
import type { AdapterConfig, ImplConfig } from './types.ts'

const { Async } = crocks
const { of, Resolved, Rejected } = Async
const { assoc, defaultTo, mergeRight, pathOr, mergeLeft } = R

const SEVEN_DAYS = 7 * 24 * 60 * 60

export default function BullMqQueueAdapter(config: AdapterConfig) {
  const checkConfig = (config: AdapterConfig) => {
    if (!config.url) return Rejected('url is required')
    return Resolved(config)
  }

  const setRedisClient = (
    config: AdapterConfig,
  ): Pick<ImplConfig, 'queueRedisClient' | 'workerRedisClient'> => {
    const { url } = config

    const configFromUrl = url ? new URL(url) : {} as URL

    const host = configFromUrl.hostname
    const port = Number(configFromUrl.port || '6379')
    const password = configFromUrl.password || undefined

    let queueRedisClient, workerRedisClient
    /**
     * See https://docs.bullmq.io/bull/patterns/persistent-connections
     * on why we set maxRetriesPerRequest differently for Queues vs. Workers
     */
    if (config.options?.cluster) {
      queueRedisClient = new Cluster([{ host, port }], {
        redisOptions: { maxRetriesPerRequest: 20 },
      })
      workerRedisClient = queueRedisClient.duplicate([{ host, port }], {
        redisOptions: { maxRetriesPerRequest: 20 },
      })
    } else {
      queueRedisClient = new Redis({ host, port, password, maxRetriesPerRequest: 20 })
      workerRedisClient = queueRedisClient.duplicate({ maxRetriesPerRequest: null })
    }

    return { queueRedisClient, workerRedisClient }
  }

  const setCreateQueue = (): ImplConfig['createQueue'] => ({ redisClient, keyPrefix }) =>
    new Queue('hyper-queue', {
      connection: redisClient,
      prefix: keyPrefix,
    })

  const setCreateWorker =
    (): ImplConfig['createWorker'] => ({ redisClient, processor, keyPrefix }) => {
      return new Worker(
        'hyper-queue',
        processor,
        {
          prefix: keyPrefix,
          connection: redisClient,
          /**
           * The adapter uses its own mechanism for
           * storing failed jobs, and so does not need
           * BullMQ to persist jobs, once they've been processed,
           * successfully or unsuccessfully
           */
          removeOnComplete: { count: 0 },
          removeOnFail: { count: 0 },
        },
      )
    }

  const setKeyPrefix = (config: AdapterConfig): ImplConfig['keyPrefix'] =>
    pathOr('', ['options', 'keyPrefix'], config)

  const setConcurrency = (config: AdapterConfig): ImplConfig['concurrency'] =>
    pathOr(10, ['options', 'concurrency'], config)

  const setFailedTtl = (config: AdapterConfig): ImplConfig['failedTtl'] =>
    pathOr(SEVEN_DAYS, ['options', 'failedTtl'], config)

  return Object.freeze({
    id: 'bullmq',
    port: PORT_NAME,
    load: (prevLoad?: any): Promise<ImplConfig> =>
      of(prevLoad)
        .map(defaultTo({}))
        .map((prevLoad) => mergeRight(prevLoad, config || {}))
        // @ts-ignore TS does not how to reconcile the Left of Sum types
        // ignoring for now
        .chain(checkConfig)
        .chain((adapterConfig) =>
          Async.of({})
            .map(assoc('keyPrefix', setKeyPrefix(adapterConfig as AdapterConfig)))
            .map(assoc('concurrency', setConcurrency(adapterConfig as AdapterConfig)))
            .map(assoc('failedTtl', setFailedTtl(adapterConfig as AdapterConfig)))
            .map(assoc('fetch', fetch))
            .map(mergeLeft(setRedisClient(adapterConfig as AdapterConfig)))
            .map(assoc('createWorker', setCreateWorker()))
            .map(assoc('createQueue', setCreateQueue()))
        )
        .toPromise()
        .catch((e) => console.log('Error: In Load Method', e.message)) as Promise<ImplConfig>,
    link: (config: ImplConfig) => () => adapter(config),
  })
}
