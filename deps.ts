export * as R from 'https://cdn.skypack.dev/ramda@0.29.1?dts'
/**
 * Shim hand-rolled crocks types
 */
// @deno-types="./crocks.d.ts"
export { default as crocks } from 'https://cdn.skypack.dev/crocks@0.12.4'

export { Queue, Worker } from 'npm:bullmq@4.12.7'

export {
  HyperErr,
  isHyperErr,
} from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-utils%40v0.1.1/packages/utils/hyper-err.js'
