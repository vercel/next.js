import type { ParsedUrlQuery } from 'querystring'
import type { Rewrite } from '../../../../lib/load-custom-routes'

import { addBasePath } from '../../../../client/add-base-path'
import { addLocale } from '../../../../client/add-locale'
import { InvariantError } from '../../invariant-error'
import { denormalizePagePath } from '../../page-path/denormalize-page-path'
import { parseRelativeUrl } from './parse-relative-url'
import {
  assign,
  searchParamsToUrlQuery,
  urlQueryToSearchParams,
} from './querystring'
import { getRouteRegex } from './route-regex'
import { isDynamicRoute } from './is-dynamic'
import { removeTrailingSlash } from './remove-trailing-slash'
import resolveRewrites from './resolve-rewrites'

/**
 * The initial rewrite reconciliation outcome for the current request.
 *
 * 1. `required`
 *    1.1. The client can already tell that the initial route/query snapshot
 *         differs from the reconciled route/query snapshot.
 *    1.2. The hydration-time reconciliation update must run.
 * 2. `not-required`
 *    2.1. The client can already tell that the initial route/query snapshot
 *         already is the reconciled route/query snapshot.
 *    2.2. The extra hydration-time reconciliation update can be skipped.
 * 3. `unknown`
 *    3.1. The client cannot safely determine whether reconciliation is
 *         required for this request.
 *    3.2. The current conservative fallback behavior is preserved.
 *    3.3. The hydration-time reconciliation update still runs.
 */
export type RewriteReconciliationState = 'required' | 'not-required' | 'unknown'

type ClientRewrite = Rewrite & {
  destination?: string
  initialReconciliationDeterministic?: boolean
}

type ClientRewrites = {
  beforeFiles: ClientRewrite[]
  afterFiles: ClientRewrite[]
  fallback: ClientRewrite[]
}

type ClientBuildManifestWithRewrites = {
  __rewrites?: ClientRewrites
}

/**
 * Type guard for `string[]` values.
 *
 * @param value the value being compared
 * @returns true when `value` is a `string[]`
 */
function isStringArray(
  value: string | string[] | undefined
): value is string[] {
  return Array.isArray(value)
}

/**
 * Compare two query entry values for rewrite reconciliation.
 *
 * @param initialValue the value serialized into the initial payload
 * @param reconciledValue the value the client router should observe
 * @returns true when both values are structurally identical
 */
export function areQueryEntryValuesEqual(
  initialValue: string | string[] | undefined,
  reconciledValue: string | string[] | undefined
): boolean {
  const initialValueIsArray = isStringArray(initialValue)
  const reconciledValueIsArray = isStringArray(reconciledValue)

  if (initialValueIsArray || reconciledValueIsArray) {
    // 1. A scalar entry and an array entry can never serialize equally.
    // 2. Stop before any element-by-element comparison.
    if (!initialValueIsArray || !reconciledValueIsArray) {
      return false
    }

    // Array-valued entries must preserve both length and element order.
    if (initialValue.length !== reconciledValue.length) {
      return false
    }

    return initialValue.every(
      (value, index) => value === reconciledValue[index]
    )
  }

  return initialValue === reconciledValue
}

/**
 * Compare two query snapshots for rewrite reconciliation.
 *
 * @param initialQuery the query serialized into the initial payload
 * @param reconciledQuery the query the client router should observe
 * @returns true when both snapshots are structurally identical
 */
export function areQuerySnapshotsEqual(
  initialQuery: ParsedUrlQuery,
  reconciledQuery: ParsedUrlQuery
): boolean {
  const initialQueryKeys = Object.keys(initialQuery)
  const reconciledQueryKeys = Object.keys(reconciledQuery)

  // Snapshot key counts must match before any per-key comparison can succeed.
  if (initialQueryKeys.length !== reconciledQueryKeys.length) {
    return false
  }

  for (const key of initialQueryKeys) {
    // Each serialized key must still exist after reconciliation.
    if (!Object.hasOwn(reconciledQuery, key)) {
      return false
    }

    // Matching keys must also preserve their serialized entry values.
    if (!areQueryEntryValuesEqual(initialQuery[key], reconciledQuery[key])) {
      return false
    }
  }

  return true
}

/**
 * Return the exact rewrite reconciliation outcome after an internal rewrite
 * match has already been established.
 *
 * 1. This helper only performs the exact snapshot comparison.
 * 2. Callers must handle the no-match and guard cases before calling it.
 *
 * @param initialRoute the route identity serialized into the initial payload
 * @param reconciledRoute the route identity the client router should observe
 * @param initialQuery the query serialized into the initial payload
 * @param reconciledQuery the query the client router should observe
 * @returns the exact rewrite reconciliation outcome for the matched rewrite
 */
export function computeMatchedRewriteReconciliationFromSnapshots(
  initialRoute: string,
  reconciledRoute: string,
  initialQuery: ParsedUrlQuery,
  reconciledQuery: ParsedUrlQuery
): Exclude<RewriteReconciliationState, 'unknown'> {
  if (initialRoute !== reconciledRoute) {
    // The matched rewrite changed the route identity.
    return 'required'
  }

  if (!areQuerySnapshotsEqual(initialQuery, reconciledQuery)) {
    // The matched rewrite changed the query snapshot.
    return 'required'
  }

  // The matched rewrite preserved both the route and query snapshots.
  return 'not-required'
}

/**
 * Return any rewrite reconciliation outcome that can already be decided from
 * the client rewrite resolution result.
 *
 * 1. Return `unknown` for external destinations.
 * 2. Return `not-required` when no internal rewrite matched.
 * 3. Return `unknown` when the matched rewrite falls outside the deterministic
 *    subset.
 * 4. Return `unknown` when a rewrite matched but no stable page identity is
 *    available yet.
 * 5. Return `undefined` when the caller should continue to exact snapshot
 *    comparison.
 *
 * @param externalDest whether rewrite resolution found an external destination
 * @param matchedRewrite whether an internal rewrite matched this request
 * @param matchedNonDeterministicRewrite whether the matched rewrite falls
 * outside the deterministic subset
 * @param matchedPage whether rewrite resolution found a stable page match
 * @param resolvedHref the resolved internal page identity, if any
 * @returns a known reconciliation outcome, or `undefined` when exact snapshot
 * comparison should continue
 */
export function getRewriteReconciliationGuardState(
  externalDest: boolean | undefined,
  matchedRewrite: boolean,
  matchedNonDeterministicRewrite: boolean,
  matchedPage: boolean,
  resolvedHref: string | undefined
): Exclude<RewriteReconciliationState, 'required'> | undefined {
  if (externalDest) {
    // The client router does not own external destinations.
    return 'unknown'
  }

  if (!matchedRewrite) {
    // No internal rewrite matched, so there is nothing to reconcile.
    return 'not-required'
  }

  if (matchedNonDeterministicRewrite) {
    // The matched rewrite is intentionally outside the exact client subset.
    return 'unknown'
  }

  if (!matchedPage || !resolvedHref) {
    // A rewrite matched, but we still cannot compare against a stable page.
    return 'unknown'
  }

  return undefined
}

/**
 * Compute the initial rewrite reconciliation state from client rewrite
 * metadata.
 *
 * 1. Resolve the current browser URL against the client rewrite manifest.
 * 2. Return any guard-state outcome the client can already decide from rewrite
 *    resolution alone.
 * 3. Otherwise compare the initial and reconciled route/query snapshots for
 *    the matched deterministic internal rewrite.
 *
 * @param initialPage the page serialized into the initial payload
 * @param initialQuery the query serialized into the initial payload
 * @param asPath the current browser `asPath`
 * @param pages the client page list
 * @param rewrites the client rewrite manifest
 * @param locale the active locale, if any
 * @param locales the configured locales, if any
 * @returns the initial rewrite reconciliation state for the current request
 */
export function computeInitialRewriteReconciliationStateFromRewrites(
  initialPage: string,
  initialQuery: ParsedUrlQuery,
  asPath: string,
  pages: string[],
  rewrites: ClientRewrites,
  locale: string | undefined,
  locales: readonly string[] | undefined
): RewriteReconciliationState {
  // Normalize the browser URL into the same route/query snapshot shape the
  // Pages Router compares during hydration.
  const parsedAs = parseRelativeUrl(asPath)
  const rewriteAsPath = addBasePath(addLocale(asPath, locale), true)
  const initialQuerySnapshot = searchParamsToUrlQuery(
    assign(
      urlQueryToSearchParams(initialQuery),
      new URLSearchParams(parsedAs.search)
    )
  )

  // Resolve rewrites against a mutable query copy so we can compare the
  // initial and reconciled snapshots afterward.
  const reconciledQuery = { ...initialQuerySnapshot }
  const rewritesResult = resolveRewrites(
    rewriteAsPath,
    pages,
    rewrites,
    reconciledQuery,
    (pathname: string) => resolveDynamicRouteForRewrites(pathname, pages),
    locales
  )

  // Short-circuit any outcome the client can already decide from rewrite
  // resolution facts alone.
  const knownRewriteReconciliation = getRewriteReconciliationGuardState(
    rewritesResult.externalDest,
    rewritesResult.matchedRewrite,
    rewritesResult.matchedNonDeterministicRewrite,
    rewritesResult.matchedPage,
    rewritesResult.resolvedHref
  )

  if (knownRewriteReconciliation) {
    return knownRewriteReconciliation
  }

  const { resolvedHref } = rewritesResult

  if (resolvedHref === undefined) {
    // The guard helper above should have already rejected this shape.
    throw new InvariantError(
      'resolvedHref should be defined when exact rewrite reconciliation can continue.'
    )
  }

  // At this point an internal deterministic rewrite matched, so only the route
  // and query snapshots decide whether reconciliation is still required.
  return computeMatchedRewriteReconciliationFromSnapshots(
    initialPage,
    resolvedHref,
    initialQuerySnapshot,
    reconciledQuery
  )
}

/**
 * Compute the initial rewrite reconciliation state before the client router is
 * created.
 *
 * 1. Reuse any exact server/runtime answer that was serialized into
 *    `__NEXT_DATA__`.
 * 2. Return `not-required` immediately when the app has no rewrites.
 * 3. Otherwise attempt exact client-side reasoning from the loaded rewrite
 *    metadata.
 * 4. If exact client-side reasoning cannot be completed safely, return
 *    `unknown` and keep the conservative fallback.
 *
 * @param initialRewriteReconciliation the serialized server/runtime result, if any
 * @param initialPage the page serialized into the initial payload
 * @param initialQuery the query serialized into the initial payload
 * @param asPath the current browser `asPath`
 * @param locale the active locale, if any
 * @param locales the configured locales, if any
 * @param loadPageList loads the client page list
 * @param loadBuildManifest loads the client build manifest, which may or may
 * not expose rewrite metadata at the type level
 * @returns the initial rewrite reconciliation state for the current request
 */
export async function computeInitialRewriteReconciliationState(
  initialRewriteReconciliation: RewriteReconciliationState | undefined,
  initialPage: string,
  initialQuery: ParsedUrlQuery,
  asPath: string,
  locale: string | undefined,
  locales: readonly string[] | undefined,
  loadPageList: () => string[] | Promise<string[]>,
  loadBuildManifest: () => Promise<ClientBuildManifestWithRewrites>
): Promise<RewriteReconciliationState> {
  // Only reuse serialized exact answers. `unknown` must keep flowing into
  // client-side reasoning or the conservative fallback.
  if (
    initialRewriteReconciliation === 'required' ||
    initialRewriteReconciliation === 'not-required'
  ) {
    return initialRewriteReconciliation
  }

  // No rewrites exist anywhere in the app, so reconciliation is impossible.
  if (!process.env.__NEXT_HAS_REWRITES) {
    return 'not-required'
  }

  try {
    // Load the client data needed for exact rewrite reasoning.
    const [pages, buildManifest] = await Promise.all([
      loadPageList(),
      loadBuildManifest(),
    ])
    const rewrites = buildManifest.__rewrites

    if (!rewrites) {
      // The app-level rewrites flag is coarse.
      // Keep the conservative fallback if the loaded client manifest does not
      // expose usable rewrite metadata.
      return 'unknown'
    }

    return computeInitialRewriteReconciliationStateFromRewrites(
      initialPage,
      initialQuery,
      asPath,
      pages,
      rewrites,
      locale,
      locales
    )
  } catch {
    // If exact client-side reasoning fails, keep the conservative fallback.
    return 'unknown'
  }
}

/**
 * Resolve the page route pathname rewrite resolution should compare against.
 *
 * 1. Concrete rewritten pathnames may need to map back to dynamic page routes.
 * 2. For example, `/blog/hello` should resolve to `/blog/[slug]`.
 * 3. Likewise, `/docs/a/b` should resolve to `/docs/[...slug]`.
 *
 * @param pathname the pathname being resolved
 * @param pages the client page list
 * @returns the matching page route pathname
 */
function resolveDynamicRouteForRewrites(
  pathname: string,
  pages: string[]
): string {
  const cleanPathname = removeTrailingSlash(denormalizePagePath(pathname))
  const normalizedPathname = removeTrailingSlash(pathname)

  if (cleanPathname === '/404' || cleanPathname === '/_error') {
    return pathname
  }

  if (pages.includes(cleanPathname)) {
    // A concrete pathname like `/gsp` already matches a page route directly.
    return normalizedPathname
  }

  for (const page of pages) {
    if (isDynamicRoute(page) && getRouteRegex(page).re.test(cleanPathname)) {
      // Map a concrete pathname like `/blog/hello` back to `/blog/[slug]`.
      return page
    }
  }

  return normalizedPathname
}
