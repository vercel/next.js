import type {
  PartialTransportData,
  PartialTransportNode,
} from '../../../shared/lib/rsc-transport'
import { isThenable } from '../../../shared/lib/is-thenable'
import { getURLFromRedirectError } from '../redirect'
import { isRedirectError } from '../redirect-error'

function noop() {}

/**
 * If `rsc` is a Flight-decoded Server Component that rejected with
 * `NEXT_REDIRECT`, return the destination. Async server components that throw
 * `redirect()` are encoded as rejected thenables; the digest is readable
 * without rendering (and therefore without committing) the tree.
 *
 * Returns null when the value is still pending or is not a redirect — those
 * cases stay on RedirectBoundary (e.g. a redirect behind a Suspense hole).
 */
function getRedirectHrefFromRsc(rsc: unknown): string | null {
  if (rsc == null) {
    return null
  }

  if (isRedirectError(rsc)) {
    return getURLFromRedirectError(rsc)
  }

  if (isThenable(rsc)) {
    const thenable = rsc as Promise<unknown> & {
      status?: string
      reason?: unknown
    }
    // Force Flight to attach `status`/`reason` when the row is already decoded.
    thenable.then(noop, noop)
    if (thenable.status === 'rejected') {
      return getRedirectHrefFromRsc(thenable.reason)
    }
  }

  return null
}

function findRedirectHrefInTransportNode(
  node: PartialTransportNode | undefined
): string | null {
  if (node === undefined) {
    return null
  }

  if (node.d !== undefined && node.d.r != null) {
    const href = getRedirectHrefFromRsc(node.d.r)
    if (href !== null) {
      return href
    }
  }

  const children = node.c
  if (children !== undefined) {
    for (const child of children.values()) {
      const href = findRedirectHrefInTransportNode(child)
      if (href !== null) {
        return href
      }
    }
  }

  return null
}

/**
 * Detect a soft `redirect()` that arrived in a navigation Flight payload.
 *
 * Fully-dynamic (ƒ) routes have no Suspense fallback, so RedirectBoundary can
 * catch `NEXT_REDIRECT` but the errored render never commits — HandleRedirect's
 * effect never runs, and the client spins. Convert the redirect into an MPA
 * navigation at the fetch layer instead (same as a hard redirect href).
 *
 * See https://github.com/vercel/next.js/issues/97898
 */
export function findRedirectHrefInTransportData(
  transportData: PartialTransportData | null | undefined
): string | null {
  if (transportData == null) {
    return null
  }

  const fromTree = findRedirectHrefInTransportNode(transportData.t)
  if (fromTree !== null) {
    return fromTree
  }

  if (transportData.h?.r != null) {
    return getRedirectHrefFromRsc(transportData.h.r)
  }

  return null
}
