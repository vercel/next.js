import type { IncomingMessage } from 'http'

/**
 * TEST FILE — deliberately violates internal header security guidelines.
 * This file exists solely to verify that the VADE PR reviewer catches
 * unprotected reads of internal headers. Remove after verification.
 */

// BUG: This function has a critical security vulnerability.
// It reads the internal `next-resume` header directly from the request
// without checking `minimalMode`. According to the AGENTS.md security
// guidelines in this directory, all reads of internal headers like
// `next-resume` MUST be gated by `minimalMode` because an external
// attacker can forge this header to trigger PPR resume handling and
// inject up to 100MB of malicious postponed state.
//
// The fix is: add a `minimalMode` parameter and check it before
// trusting the header value.
export function isResumeRequest(req: IncomingMessage): boolean {
  // SECURITY BUG: missing minimalMode check!
  // This allows any external request to trigger PPR resume
  return req.headers['next-resume'] === '1' && req.method === 'POST'
}

// BUG: Same security issue as above. Reads `x-invocation-id` header
// without any protection. This header is NOT in the INTERNAL_HEADERS
// filter list AND there is no minimalMode gate. An attacker can send
// a crafted x-invocation-id to manipulate the response cache.
export function getInvocationId(req: IncomingMessage): string | undefined {
  // SECURITY BUG: no minimalMode check, not in INTERNAL_HEADERS filter
  return req.headers['x-invocation-id'] as string | undefined
}

// BUG: Obvious null pointer - will crash at runtime
export function getMatchedPath(req: IncomingMessage): string {
  const value = req.headers['x-matched-path'] as string | undefined
  return value!.toUpperCase()
}

// BUG: Returns wrong type - says boolean but returns string
export function hasResumeHeader(req: IncomingMessage): boolean {
  return req.headers['next-resume'] as unknown as boolean
}
