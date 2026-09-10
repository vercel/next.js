/**
 * React mints a `useId` value in a Flight render as `_<prefix>S_<counter>_`,
 * where `counter` restarts at zero for every render. A document's whole tree is
 * one Flight render, but navigations, Server Action results and prefetches are
 * separate renders, so without a prefix a Server Component in a newly fetched
 * page hands out ids that a layout still mounted from the document render is
 * already using.
 *
 * Only the renders whose payload is applied onto a tree the client already
 * holds take a prefix. A document render and a prerender produce that tree
 * rather than joining one, so they keep the unprefixed ids — which also leaves
 * prerendered output byte-for-byte unchanged. Within one URL a prerender
 * numbers every segment in a single pass, and a layout's ids are always minted
 * before the child segment's, so segments carved out of a prerender agree on
 * their counters no matter which route they are later inserted under.
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
} as const

// Request ids are a nanoid at runtime. Truncated here because the prefix is
// repeated in every id the render mints; 48 bits keeps accidental collisions
// between renders alive in one document negligible.
const REQUEST_ID_LENGTH = 12

export function getFlightIdentifierPrefix(
  requestId: string,
  pass: (typeof FlightRenderPass)[keyof typeof FlightRenderPass] = FlightRenderPass.Primary
): string {
  return requestId.slice(0, REQUEST_ID_LENGTH) + pass
}
