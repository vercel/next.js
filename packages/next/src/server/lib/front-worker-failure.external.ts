import { randomBytes, timingSafeEqual } from 'crypto'

/**
 * Request header next-front adds when it hands Node a route.go request whose
 * worker failed before answering, so Node answers it exactly as it does when
 * its own call to the worker fails (its error page). The value is a secret
 * that only this Node process and its front know; Node removes the header
 * from every request (INTERNAL_HEADERS), so a client can't send it.
 */
export const FRONT_WORKER_FAILED_HEADER = 'x-next-internal-front-worker-failed'

let secret: Buffer | undefined

/** Creates the secret for this process; called once, for the front's table. */
export function createFrontWorkerFailureSecret(): string {
  secret ??= randomBytes(32)
  return secret.toString('hex')
}

/** Whether a header value carries this process's secret. */
export function isFrontWorkerFailure(value: unknown): boolean {
  if (!secret || typeof value !== 'string') return false
  const given = Buffer.from(value, 'hex')
  return given.length === secret.length && timingSafeEqual(given, secret)
}
