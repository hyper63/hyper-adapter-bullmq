export * as R from 'https://cdn.skypack.dev/ramda@0.29.0?dts'
/**
 * Shim hand-rolled crocks types
 */
// @deno-types="./crocks.d.ts"
export { default as crocks } from 'https://cdn.skypack.dev/crocks@0.12.4'

export { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'

export { type Job, type JobType, Queue, Worker } from 'npm:bullmq@4.12.7'
export { Cluster, Redis } from 'npm:ioredis@5.3.2'
export { default as cuid } from 'npm:cuid@3.0.0'

export {
  HyperErr,
  isHyperErr,
} from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-utils%40v0.1.1/packages/utils/hyper-err.js'
