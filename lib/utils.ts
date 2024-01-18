import { hmac } from '../deps.ts'

export const createStoreKey = (prefix: string, name: string) => `${prefix}_store_${name}`

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
