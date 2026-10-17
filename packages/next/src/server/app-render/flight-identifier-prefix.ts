/**
 * A `useId` value is unique within one Flight render, not across renders. A
 * document's whole tree is one render, but navigations, Server Action results
 * and prefetches are separate renders, so without a prefix a Server Component
 * in a newly fetched page can hand out an id that a layout still mounted from
 * the document render is already using.
 *
 * Only renders whose payload is applied onto a tree the client already holds
 * take a prefix. A document render and a prerender produce that tree rather
 * than joining one, so their ids keep their unprefixed form. The segments
 * carved out of a single prerender agree on their ids because they come from
 * one render; `test/e2e/app-dir/use-id-static-segments` covers what that
 * relies on.
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
