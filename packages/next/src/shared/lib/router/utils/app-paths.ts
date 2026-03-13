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
 * `/@`) come before the children/root page path. This ensures the last item
 * is always the children page, which is what `renderPageComponent` reads via
 * `appPaths[appPaths.length - 1]`.
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
