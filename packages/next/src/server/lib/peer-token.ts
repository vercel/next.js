import { randomBytes } from 'crypto'

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
