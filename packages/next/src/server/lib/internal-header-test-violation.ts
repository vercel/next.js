import type { IncomingMessage } from 'http'

/**
 * TEST FILE — deliberately violates internal header security guidelines.
 * This file exists solely to verify that the VADE PR reviewer catches
 * unprotected reads of internal headers. Remove after verification.
 */

/**
 * Checks if this is a PPR resume request by reading the `next-resume` header.
 *
 * VIOLATION: reads `next-resume` without gating on `minimalMode`.
 * An external attacker can forge this header to trigger PPR resume handling.
 */
export function isResumeRequest(req: IncomingMessage): boolean {
  return req.headers['next-resume'] === '1' && req.method === 'POST'
}

/**
 * Reads the invocation ID for cache scoping.
 *
 * VIOLATION: reads `x-invocation-id` without gating on `minimalMode`
 * and the header is not in the INTERNAL_HEADERS filter list.
 */
export function getInvocationId(req: IncomingMessage): string | undefined {
  return req.headers['x-invocation-id'] as string | undefined
}
