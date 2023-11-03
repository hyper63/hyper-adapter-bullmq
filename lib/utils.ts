import { hmac } from '../deps.ts'

export const createStoreKey = (prefix: string, name: string) => `${prefix}_store_${name}`

export const computeSignature = (secret: string, payload: unknown, time: number) => {
  const msg = `${time}.${JSON.stringify(payload, null, 0)}`
  const signature = hmac('sha256', secret, msg, 'utf8', 'hex')
  return signature
}
