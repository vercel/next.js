import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'

/**
 * Static siblings of dynamic segments, keyed by the URL path of their parent
 * (e.g. `/products` -> `['sale', 'new']`). Built once per build from all app
 * routes, so that `next-app-loader` doesn't need the full list of routes in
 * every entry's loader options (which grows quadratically with the number of
 * routes).
 */
export type StaticSiblingsIndex = Map<string, string[]>

/**
 * A subset of the {@link StaticSiblingsIndex} with only the parent URL paths
 * that a single app entry can query. Passed as a loader option.
 */
export type StaticSiblingsByParentUrl = Record<string, string[]>

export const isDynamicSegment = (segment: string) =>
  segment.startsWith('[') && segment.endsWith(']')

function toUrlSegments(appPath: string): string[] {
  return normalizeAppPath(appPath).split('/').filter(Boolean)
}

function getParentUrlPath(urlSegments: readonly string[], level: number) {
  return level === 0 ? '/' : '/' + urlSegments.slice(0, level).join('/')
}

/**
 * Collects, for every parent URL path, the static segment names of its
 * children across all app routes (route groups and parallel route slots don't
 * contribute to the URL). Segment order follows the order of
 * `allNormalizedAppPaths`.
 */
export function createStaticSiblingsIndex(
  allNormalizedAppPaths: readonly string[]
): StaticSiblingsIndex {
  const index = new Map<string, Set<string>>()
  for (const appPath of allNormalizedAppPaths) {
    const urlSegments = toUrlSegments(appPath)
    for (let level = 0; level < urlSegments.length; level++) {
      const segment = urlSegments[level]
      if (isDynamicSegment(segment)) {
        continue
      }
      const parentUrlPath = getParentUrlPath(urlSegments, level)
      let siblings = index.get(parentUrlPath)
      if (!siblings) {
        siblings = new Set()
        index.set(parentUrlPath, siblings)
      }
      siblings.add(segment)
    }
  }
  return new Map(
    Array.from(index, ([parentUrlPath, siblings]) => [
      parentUrlPath,
      Array.from(siblings),
    ])
  )
}

/**
 * Selects the parts of the index that the loader can query for an entry:
 * the parents of every dynamic segment along the entry's own app paths.
 */
export function getStaticSiblingsByParentUrl(
  index: StaticSiblingsIndex,
  appPaths: readonly string[]
): StaticSiblingsByParentUrl {
  const result: StaticSiblingsByParentUrl = {}
  for (const appPath of appPaths) {
    const urlSegments = toUrlSegments(appPath)
    for (let level = 0; level < urlSegments.length; level++) {
      if (!isDynamicSegment(urlSegments[level])) {
        continue
      }
      const parentUrlPath = getParentUrlPath(urlSegments, level)
      result[parentUrlPath] = index.get(parentUrlPath) ?? []
    }
  }
  return result
}

/**
 * For a given segment path (in file system space, e.g.
 * `(group)/products/[id]`), returns the static sibling segments at the same
 * URL path level. Siblings may live in different parts of the file system
 * tree (e.g. other route groups) but at the same URL level:
 *
 *   /app/(marketing)/products/sale/page.tsx -> /products/sale
 *   /app/(shop)/products/[id]/page.tsx -> /products/[id]
 *
 * When called with `(shop)/products/[id]`, this returns `['sale']`. Only
 * dynamic segments have static siblings; `null` (dev, where not all routes
 * are known) means none are known.
 */
export function getStaticSiblingSegments(
  staticSiblingsByParentUrl: StaticSiblingsByParentUrl | null | undefined,
  segmentPath: string
): string[] {
  // Add a trailing /page so normalizeAppPath strips it properly
  const currentUrlSegments = toUrlSegments(segmentPath + '/page')

  // If the path is empty (root level), there are no siblings
  if (currentUrlSegments.length === 0) {
    return []
  }

  const currentSegment = currentUrlSegments[currentUrlSegments.length - 1]
  if (!isDynamicSegment(currentSegment) || !staticSiblingsByParentUrl) {
    return []
  }

  const parentUrlPath = getParentUrlPath(
    currentUrlSegments,
    currentUrlSegments.length - 1
  )
  // The current segment is dynamic, so it is never one of its static siblings.
  return Object.prototype.hasOwnProperty.call(
    staticSiblingsByParentUrl,
    parentUrlPath
  )
    ? staticSiblingsByParentUrl[parentUrlPath]
    : []
}
