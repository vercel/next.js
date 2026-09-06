/**
 * One entry in the route table that a build passes to an adapter can serve
 * several fallback shells.
 *
 * A fallback shell repeats the whole path of its source page, and it resolves
 * the leading params of that page to concrete values. Those values form the
 * prefix of the shell path, so the shells of one source page differ only in
 * that prefix. A pattern can list several prefixes as alternatives, which lets
 * one entry match them all.
 *
 * The shells that one entry serves are a run: a stretch of neighbours in the
 * manifest. Adjacency is what makes a run safe to serve from one entry. That
 * entry takes the position of the first shell of the run, which this file
 * calls the representative, so every shell that the entry replaces keeps its
 * place relative to the routes around it.
 */

import type { RoutesManifest } from '..'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'

export type FallbackShellRun = {
  /**
   * The prefix of each shell of the run, in the order that the manifest lists
   * them. The pattern of the entry holds these as alternatives, and the first
   * one belongs to the representative.
   */
  prefixes: readonly string[]
  /**
   * The path that follows the prefix, without a leading slash. Every shell of
   * the run shares it.
   */
  tail: string
}

export type FallbackShellRuns = {
  /**
   * The runs, keyed by the page of the representative of each.
   */
  byRepresentativePage: Map<string, FallbackShellRun>
  /**
   * The pages of the shells that a run serves, apart from the representative
   * that keys it. The caller emits no entry of its own for these.
   */
  replacedPages: Set<string>
}

/**
 * A run while this file still collects it. The exported shape holds only what
 * the caller needs in order to emit the entry.
 */
type PendingRun = {
  /**
   * The source page that every shell of the run repeats.
   */
  sourcePage: string
  /**
   * The path that every shell of the run has after its prefix.
   */
  tail: string
  /**
   * Whether the shells have `fallback: false`. Every shell of the run agrees on
   * this value.
   */
  isFallbackFalse: boolean
  /**
   * The shells of the run, in the order that the manifest lists them.
   */
  shells: Array<{
    /**
     * The page of the shell.
     */
    page: string
    /**
     * The leading part of that page, which holds the values that the shell
     * resolves for the params of the source page.
     */
    prefix: string
  }>
}

/**
 * Splits the page of a fallback shell into the prefix that holds its resolved
 * param values, and the path that follows.
 *
 * Returns undefined when the page resolves nothing, or when the resolved
 * segments are not consecutive from the first segment onwards.
 */
function splitShellPage(
  page: string,
  sourcePage: string
): { prefix: string; tail: string } | undefined {
  const pageSegments = page.split('/')
  const sourceSegments = sourcePage.split('/')
  if (pageSegments.length !== sourceSegments.length) {
    return undefined
  }

  const resolved: number[] = []
  for (let index = 0; index < pageSegments.length; index++) {
    if (pageSegments[index] !== sourceSegments[index]) {
      resolved.push(index)
    }
  }
  if (resolved.length === 0) {
    return undefined
  }

  // A shell resolves the leading params of its source page, so the resolved
  // segments are consecutive and the first of them is the first segment of the
  // path. `split` returns an empty string at index 0, so they start at index 1.
  for (let position = 0; position < resolved.length; position++) {
    if (resolved[position] !== position + 1) {
      return undefined
    }
  }

  // The source page declares a param at each resolved position, and the shell
  // holds a value there. Anything else means the two pages differ for another
  // reason, and the leading segments are not a prefix of resolved values.
  for (const index of resolved) {
    if (
      !sourceSegments[index].startsWith('[') ||
      pageSegments[index].startsWith('[')
    ) {
      return undefined
    }
  }

  const tailStart = resolved.length + 1
  return {
    prefix: pageSegments.slice(1, tailStart).join('/'),
    tail: pageSegments.slice(tailStart).join('/'),
  }
}

/**
 * Collects the runs of fallback shells that one entry can serve.
 *
 * The shells of a run are neighbours in the manifest that agree on:
 *
 * - The source page.
 * - The path that follows the prefix.
 * - The value of `fallback: false`.
 *
 * They have to be neighbours because the entry takes the position of the first
 * shell of the run. Every shell that the entry replaces then keeps its place
 * relative to the routes around it. Any other route between two shells ends the
 * run, because an entry that reached across it would move ahead of a route that
 * a request matches first.
 *
 * They have to agree on `fallback: false` because an entry carries one set of
 * conditions.
 *
 * The caller builds one pattern for a run, and it lists the prefixes of the run
 * as complete alternatives. For a source page `/[team]/[locale]/posts/[id]`
 * with shells for `acme/en`, `acme/de` and `globex/en`, that pattern holds:
 *
 * ```
 * (?<shellPrefix>acme/en|acme/de|globex/en)
 * ```
 *
 * A pattern that offered a choice per param instead, such as
 * `(acme|globex)/(en|de)`, would also match `globex/de`. The build never
 * prerendered that pair, so a request for it would resolve to an output that
 * does not exist, and it would then fall through to whichever route claims the
 * rewritten path.
 *
 * A shell can belong to no run, and one source page can hold several runs. That
 * happens when the build resolves a different number of params for neighbouring
 * shells, because their prefixes then have different lengths and the paths that
 * follow them differ.
 *
 * A run of only one shell has a single prefix, so an entry for it would match
 * what the entry for that shell already matches. This function leaves such a
 * shell out of the result.
 */
export function collectFallbackShellRuns(
  dynamicRoutes: RoutesManifest['dynamicRoutes'],
  hasFallbackFalse: (page: string) => boolean
): FallbackShellRuns {
  const runs: PendingRun[] = []
  let current: PendingRun | undefined

  for (const route of dynamicRoutes) {
    // `pageToRoute` sets `sourcePage` only when the build passes it a source
    // page, and the build does that for a fallback shell. The field therefore
    // names the page whose path this shell repeats, and it is absent on every
    // other route.
    const { sourcePage } = route
    const split =
      sourcePage && sourcePage !== route.page
        ? splitShellPage(route.page, sourcePage)
        : undefined

    // This route is not a shell that a run can hold, so it ends the run in
    // progress.
    if (!sourcePage || !split) {
      current = undefined
      continue
    }

    const isFallbackFalse = hasFallbackFalse(route.page)

    if (
      current &&
      (current.sourcePage !== sourcePage ||
        current.tail !== split.tail ||
        current.isFallbackFalse !== isFallbackFalse)
    ) {
      current = undefined
    }

    if (!current) {
      current = {
        sourcePage,
        tail: split.tail,
        isFallbackFalse,
        shells: [],
      }
      runs.push(current)
    }

    current.shells.push({ page: route.page, prefix: split.prefix })
  }

  const byRepresentativePage = new Map<string, FallbackShellRun>()
  const replacedPages = new Set<string>()

  for (const run of runs) {
    if (run.shells.length < 2) {
      continue
    }

    // The caller replaces the escaped prefix at the start of the pattern for
    // the representative, so this function keeps the run only when that pattern
    // starts with the prefix.
    //
    // Two things make that true today. `getNamedRouteRegex` escapes each
    // segment the same way, and a fallback shell keeps at least one param
    // unresolved, so a slash always follows its prefix. This check holds the
    // run back if either stops being true.
    const [representative, ...replaced] = run.shells
    const { namedRegex } = getNamedRouteRegex(representative.page, {
      prefixRouteKeys: true,
    })
    if (
      !namedRegex.startsWith(`^/${escapeStringRegexp(representative.prefix)}/`)
    ) {
      continue
    }

    byRepresentativePage.set(representative.page, {
      prefixes: run.shells.map((shell) => shell.prefix),
      tail: run.tail,
    })
    for (const shell of replaced) {
      replacedPages.add(shell.page)
    }
  }

  return { byRepresentativePage, replacedPages }
}
