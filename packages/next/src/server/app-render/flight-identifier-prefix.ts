/**
 * React mints a `useId` value in a Flight render as `_<prefix>S_<counter>_`,
 * where `counter` restarts at zero for every render. A document's whole tree is
 * one Flight render, but navigations, Server Action results and prefetches are
 * separate renders, so without a prefix a Server Component in a newly fetched
 * page hands out ids that a layout still mounted from the document render is
 * already using.
 *
 * Every Flight render therefore gets a prefix derived from the request it
 * belongs to, plus a tag for the renders that share one request. Prerenders
 * derive their request id from the URL, so build output stays byte-stable.
 */

/**
 * Distinguishes Flight renders that share a request id. Renders in different
 * requests are already distinct, so most renders are `Primary`.
 */
export const FlightRenderPass = {
  /** The render whose payload the client applies to the tree. */
  Primary: '',
  /** A prefetch payload embedded in another render's payload. */
  Prefetch: 'p',
  /** An error tree rendered after the primary render failed. */
  Error: 'e',
} as const

// Request ids are a nanoid at runtime and a SHA-1 of the URL when prerendering.
// Both are truncated here because the prefix is repeated in every id the render
// mints; 48 bits keeps accidental collisions across a large build negligible.
const REQUEST_ID_LENGTH = 12

export function getFlightIdentifierPrefix(
  requestId: string,
  pass: (typeof FlightRenderPass)[keyof typeof FlightRenderPass] = FlightRenderPass.Primary
): string {
  return requestId.slice(0, REQUEST_ID_LENGTH) + pass
}
