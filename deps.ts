// @deno-types="npm:@types/ramda@^0.29.9"
export * as R from 'npm:ramda@0.29.1'
/**
 * Shim hand-rolled crocks types
 */
// @deno-types="./crocks.d.ts"
export { default as crocks } from 'npm:crocks@0.12.4'

export { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts'

export { type Job, type JobType, Queue, Worker } from 'npm:bullmq@5.1.3'
export { Cluster, Redis } from 'npm:ioredis@5.3.2'
export { default as cuid } from 'npm:cuid@3.0.0'

import {
  HyperErr,
  isHyperErr as isHyperErrBase,
} from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-utils%40v0.1.2/packages/utils/hyper-err.js'

export { HyperErr }

/**
 * The new ramda types in hyper-utils are overly assuming, so
 * just wrap the isHyperErr from utils with a more unassuming signature
 */
// deno-lint-ignore no-explicit-any
export const isHyperErr = (v: any) => isHyperErrBase(v)
