import { ensureLeadingSlash } from '../../page-path/ensure-leading-slash'
import { isGroupSegment } from '../../segment'

/**
 * Normalizes an app route so it represents the actual request path. Essentially
 * performing the following transformations:
 *
 * - `/(dashboard)/user/[id]/page` to `/user/[id]`
 * - `/(dashboard)/account/page` to `/account`
 * - `/user/[id]/page` to `/user/[id]`
 * - `/account/page` to `/account`
 * - `/page` to `/`
 * - `/(dashboard)/user/[id]/route` to `/user/[id]`
 * - `/(dashboard)/account/route` to `/account`
 * - `/user/[id]/route` to `/user/[id]`
 * - `/account/route` to `/account`
 * - `/route` to `/`
 * - `/` to `/`
 *
 * @param route the app route to normalize
 * @returns the normalized pathname
 */
export function normalizeAppPath(route: string) {
  return ensureLeadingSlash(
    route.split('/').reduce((pathname, segment, index, segments) => {
      // Empty segments are ignored.
      if (!segment) {
        return pathname
      }

      // Groups are ignored.
      if (isGroupSegment(segment)) {
        return pathname
      }

      // Parallel segments are ignored.
      if (segment[0] === '@') {
        return pathname
      }

      // The last segment (if it's a leaf) should be ignored.
      if (
        (segment === 'page' || segment === 'route') &&
        index === segments.length - 1
      ) {
        return pathname
      }

      return `${pathname}/${segment}`
    }, '')
  )
}

/**
 * Comparator for sorting app paths so that parallel slot paths (containing
 * `/@`) come before the children/root page path. This keeps the direct
 * children/root page last so it can be selected as the canonical entry.
 *
 * Without this, route group prefixes like `(group)` (char code 0x28) sort
 * before `@` (0x40), causing the children page to sort first instead of last
 * and leading to a manifest mismatch / 404 in webpack dev mode.
 */
export function compareAppPaths(a: string, b: string): number {
  const aHasSlot = a.includes('/@')
  const bHasSlot = b.includes('/@')
  if (aHasSlot && !bHasSlot) return -1
  if (!aHasSlot && bHasSlot) return 1
  return a.localeCompare(b)
}

function normalizeAppPageEntryPathname(appPath: string): string {
  // Webpack app entries preserve escaped underscore segments as `%5F`, while
  // normalized request pathnames expose the decoded `_` segment.
  return normalizeAppPath(appPath).replace(/%5F/g, '_')
}

/**
 * Selects the app path that owns the compiled entry for a normalized route.
 * Catch-all normalization can add app paths from other routes, so only direct
 * paths are candidates. Among those, compareAppPaths deterministically prefers
 * the children/root page, or a stable slot when the route only has slots.
 */
export function selectAppPageEntry(
  pathname: string,
  appPaths: readonly string[],
  normalizePathname: (appPath: string) => string = normalizeAppPageEntryPathname
): string {
  let entry: string | undefined

  for (const appPath of appPaths) {
    if (normalizePathname(appPath) !== pathname) continue

    if (entry === undefined || compareAppPaths(entry, appPath) < 0) {
      entry = appPath
    }
  }

  if (entry === undefined) {
    throw new Error(`Invariant: no direct app page entry found for ${pathname}`)
  }

  return entry
}

/**
 * Strips the `.rsc` extension if it's in the pathname.
 * Since this function is used on full urls it checks `?` for searchParams handling.
 */
export function normalizeRscURL(url: string) {
  return url.replace(
    /\.rsc($|\?)/,
    // $1 ensures `?` is preserved
    '$1'
  )
}
