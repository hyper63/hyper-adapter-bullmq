import { hmac } from '../deps.ts'

/**
 * eg. prefix_store_{foo-queue}
 *
 * @param prefix - a prefix for the key
 * @param name - the name of the store (will be used for the hashtag to ensure all keys are mapped to the same hash slot)
 */
export const createStoreKey = (prefix: string, name: string) => `${prefix}_store_{${name}}`

/**
 * eg. prefix_store_{foo-queue}_job_READY_job-id-123
 *
 * @param prefix - a prefix for the key
 * @param name - the name of the store (will be used for the hashtag to ensure all keys are mapped to the same hash slot)
 * @param rest - any other parts to include on the key
 */
export const createJobKey = (prefix: string, name: string, ...rest: string[]) =>
  `${createStoreKey(prefix, name)}_job_${rest.join('_')}`

export const computeSignature = (secret: string, payload: unknown, time: number) => {
  const msg = `${time}.${JSON.stringify(payload, null, 0)}`
  const signature = hmac('sha256', secret, msg, 'utf8', 'hex')
  return signature
}

/**
 * A simple trampoline to orchestrate continuation-passing style,
 * as a workaround for lack of tail-call optimization resulting in callstack
 * overflows from arbitraily deep recursion
 */
export async function trampoline<R>(init: R | Promise<R> | (() => Promise<R>)) {
  let result = init
  /**
   * We check results type at runtime explcitly, so it is safe to cast to satisfy TS
   */
  while (typeof result === 'function') result = await (result as () => Promise<R>)()
  return result
}
