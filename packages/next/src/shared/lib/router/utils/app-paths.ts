import { ensureLeadingSlash } from '../../page-path/ensure-leading-slash'

function appPathMapper(
  pathname: string,
  segment: string,
  index: number,
  segments: string[]
) {
  // Groups are ignored.
  if (segment.startsWith('(') && segment.endsWith(')')) {
    return pathname
  }

  // Parallel segments are ignored.
  if (segment.startsWith('@')) {
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
}

function appMetadataPathMapper(
  pathname: string,
  segment: string,
  index: number,
  segments: string[]
) {
  // Groups are ignored.
  if (segment.startsWith('[') && segment.endsWith(']')) {
    let replacedSegment = segment
    if (segment.startsWith('[[...') && segment.endsWith(']]')) {
      replacedSegment = '_cas_'
    } else if (segment.startsWith('[...') && segment.endsWith(']')) {
      replacedSegment = '_cs_'
    } else if (segment.startsWith('[') && segment.endsWith(']')) {
      replacedSegment = '_s_'
    }
    return `${pathname}/${replacedSegment}`
  }

  return appPathMapper(pathname, segment, index, segments)
}

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
  return normalizePathBySegment(route, (pathname, segment, index, segments) => {
    // Empty segments are ignored.
    if (!segment) {
      return pathname
    }
    return appPathMapper(pathname, segment, index, segments)
  })
}

/**
 * Normalizes an app metadata image route so it represents the actual request path. Essentially
 * performing the following transformations:
 *
 * - `/(dashboard)/user/[id]/page` to `/user/_m_id`
 * - `/(dashboard)/account/page` to `/account`
 * - `/user/[id]/page` to `/user/_m_id`
 * - `/account/page` to `/account`
 * - `/page` to `/`
 * - `/(dashboard)/user/[id]/route` to `/user/_m_id`
 * - `/(dashboard)/account/route` to `/account`
 * - `/user/[id]/route` to `/user/_m_id`
 * - `/user/[[...slug]]/route` to `/user/_m_slug`
 * - `/account/route` to `/account`
 * - `/route` to `/`
 * - `/` to `/`
 *
 * @param route the app route to normalize
 * @returns the normalized pathname
 */
export function normalizeMetadataImagePath(route: string) {
  return normalizePathBySegment(route, (pathname, segment, index, segments) => {
    // Empty segments are ignored.
    if (!segment) {
      return pathname
    }
    return appMetadataPathMapper(pathname, segment, index, segments)
  })
}

function normalizePathBySegment(
  route: string,
  mapper: (
    pathname: string,
    segment: string,
    index: number,
    segments: string[]
  ) => string
) {
  return ensureLeadingSlash(
    route.split('/').reduce((pathname, segment, index, segments) => {
      return mapper(pathname, segment, index, segments)
    }, '')
  )
}

/**
 * Strips the `.rsc` extension if it's in the pathname.
 * Since this function is used on full urls it checks `?` for searchParams handling.
 */
export function normalizeRscPath(pathname: string, enabled?: boolean) {
  return enabled
    ? pathname.replace(
        /\.rsc($|\?)/,
        // $1 ensures `?` is preserved
        '$1'
      )
    : pathname
}
