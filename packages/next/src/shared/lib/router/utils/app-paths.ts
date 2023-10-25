import { ensureLeadingSlash } from '../../page-path/ensure-leading-slash'
import { isGroupSegment } from '../../segment'
import { parse, format } from 'url'

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

/**
 * Strips the `/_next/postponed` prefix if it's in the pathname.
 *
 * @param url the url to normalize
 */
export function normalizePostponedURL(url: string) {
  const parsed = parse(url)
  let { pathname } = parsed
  if (pathname && pathname.startsWith('/_next/postponed')) {
    pathname = pathname.substring('/_next/postponed'.length) || '/'

    return format({ ...parsed, pathname })
  }

  return url
}
