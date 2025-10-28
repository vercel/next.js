import { PAGE_SEGMENT_KEY } from '../segment'
import type { Segment as FlightRouterStateSegment } from '../app-router-types'

// TypeScript trick to simulate opaque types, like in Flow.
type Opaque<K, T> = T & { __brand: K }

export type SegmentRequestKeyPart = Opaque<'SegmentRequestKeyPart', string>
export type SegmentRequestKey = Opaque<'SegmentRequestKey', string>
export type SegmentCacheKeyPart = Opaque<'SegmentCacheKeyPart', string>
export type SegmentCacheKey = Opaque<'SegmentCacheKey', string>

export const ROOT_SEGMENT_REQUEST_KEY = '' as SegmentRequestKey
export const ROOT_SEGMENT_CACHE_KEY = '' as SegmentCacheKey

export function createSegmentRequestKeyPart(
  segment: FlightRouterStateSegment
): SegmentRequestKeyPart {
  if (typeof segment === 'string') {
    if (segment.startsWith(PAGE_SEGMENT_KEY)) {
      // The Flight Router State type sometimes includes the search params in
      // the page segment. However, the Segment Cache tracks this as a separate
      // key. So, we strip the search params here, and then add them back when
      // the cache entry is turned back into a FlightRouterState. This is an
      // unfortunate consequence of the FlightRouteState being used both as a
      // transport type and as a cache key; we'll address this once more of the
      // Segment Cache implementation has settled.
      // TODO: We should hoist the search params out of the FlightRouterState
      // type entirely, This is our plan for dynamic route params, too.
      return PAGE_SEGMENT_KEY as SegmentRequestKeyPart
    }
    const safeName =
      // TODO: FlightRouterState encodes Not Found routes as "/_not-found".
      // But params typically don't include the leading slash. We should use
      // a different encoding to avoid this special case.
      segment === '/_not-found'
        ? '_not-found'
        : encodeToFilesystemAndURLSafeString(segment)
    // Since this is not a dynamic segment, it's fully encoded. It does not
    // need to be "hydrated" with a param value.
    return safeName as SegmentRequestKeyPart
  }

  const name = segment[0]
  const paramType = segment[2]
  const safeName = encodeToFilesystemAndURLSafeString(name)

  const encodedName = '$' + paramType + '$' + safeName
  return encodedName as SegmentRequestKeyPart
}

export function appendSegmentRequestKeyPart(
  parentRequestKey: SegmentRequestKey,
  parallelRouteKey: string,
  childRequestKeyPart: SegmentRequestKeyPart
): SegmentRequestKey {
  // Aside from being filesystem safe, segment keys are also designed so that
  // each segment and parallel route creates its own subdirectory. Roughly in
  // the same shape as the source app directory. This is mostly just for easier
  // debugging (you can open up the build folder and navigate the output); if
  // we wanted to do we could just use a flat structure.

  // Omit the parallel route key for children, since this is the most
  // common case. Saves some bytes (and it's what the app directory does).
  const slotKey =
    parallelRouteKey === 'children'
      ? childRequestKeyPart
      : `@${encodeToFilesystemAndURLSafeString(parallelRouteKey)}/${childRequestKeyPart}`
  return (parentRequestKey + '/' + slotKey) as SegmentRequestKey
}

export function createSegmentCacheKeyPart(
  requestKeyPart: SegmentRequestKeyPart,
  segment: FlightRouterStateSegment
): SegmentCacheKeyPart {
  if (typeof segment === 'string') {
    return requestKeyPart as any as SegmentCacheKeyPart
  }
  const paramValue = segment[1]
  const safeValue = encodeToFilesystemAndURLSafeString(paramValue)
  return (requestKeyPart + '$' + safeValue) as SegmentCacheKeyPart
}

export function appendSegmentCacheKeyPart(
  parentSegmentKey: SegmentCacheKey,
  parallelRouteKey: string,
  childCacheKeyPart: SegmentCacheKeyPart
): SegmentCacheKey {
  const slotKey =
    parallelRouteKey === 'children'
      ? childCacheKeyPart
      : `@${encodeToFilesystemAndURLSafeString(parallelRouteKey)}/${childCacheKeyPart}`
  return (parentSegmentKey + '/' + slotKey) as SegmentCacheKey
}

// Define a regex pattern to match the most common characters found in a route
// param. It excludes anything that might not be cross-platform filesystem
// compatible, like |. It does not need to be precise because the fallback is to
// just base64url-encode the whole parameter, which is fine; we just don't do it
// by default for compactness, and for easier debugging.
const simpleParamValueRegex = /^[a-zA-Z0-9\-_@]+$/

function encodeToFilesystemAndURLSafeString(value: string) {
  if (simpleParamValueRegex.test(value)) {
    return value
  }
  // If there are any unsafe characters, base64url-encode the entire value.
  // We also add a ! prefix so it doesn't collide with the simple case.
  const base64url = btoa(value)
    .replace(/\+/g, '-') // Replace '+' with '-'
    .replace(/\//g, '_') // Replace '/' with '_'
    .replace(/=+$/, '') // Remove trailing '='
  return '!' + base64url
}

export function convertSegmentPathToStaticExportFilename(
  segmentPath: string
): string {
  return `__next${segmentPath.replace(/\//g, '.')}.txt`
}
