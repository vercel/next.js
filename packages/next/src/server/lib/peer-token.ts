import { randomBytes, timingSafeEqual } from 'crypto'
import type { IncomingMessage } from 'http'

/**
 * How a Next.js process proves to another one it started that a request
 * comes from it. The process that starts a private listener makes its token,
 * passes it to the listener in PEER_TOKEN_ENV, and every caller sends it in
 * PEER_TOKEN_HEADER. The listener answers only requests that carry it, and
 * removes the header before app code sees the request.
 *
 * The Go worker templates (crates/next-api/src/templates) spell these names
 * out; test/unit/peer-token.test.ts keeps them equal.
 */
export const PEER_TOKEN_ENV = '__NEXT_PRIVATE_PEER_TOKEN'

export const PEER_TOKEN_HEADER = 'x-next-internal-peer-token'

/** A new token: 32 random bytes as hex. */
export function createPeerToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Reads a header from a request Node received and removes it, from both
 * `headers` and `rawHeaders`, so app code never sees it.
 */
export function takeHeader(
  req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>,
  name: string
): string | string[] | undefined {
  const value = req.headers[name]
  if (value === undefined) return undefined
  delete req.headers[name]
  for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
    if (req.rawHeaders[i].toLowerCase() === name) {
      req.rawHeaders.splice(i, 2)
    }
  }
  return value
}

/**
 * Checks the token a caller sent against this listener's, in constant time,
 * and removes the header.
 */
export function takePeerToken(
  req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>,
  expected: Buffer
): 'valid' | 'missing' | 'invalid' {
  const value = takeHeader(req, PEER_TOKEN_HEADER)
  if (value === undefined) return 'missing'
  // Node joins repeated headers into one string, so a repeated token is
  // invalid too.
  if (typeof value !== 'string') return 'invalid'
  const received = Buffer.from(value, 'latin1')
  return received.length === expected.length &&
    timingSafeEqual(received, expected)
    ? 'valid'
    : 'invalid'
}
