/**
 * Cache tags are serialized into HTTP headers, so each path segment must be
 * ASCII-safe. We canonicalize every segment by decoding (when possible) and
 * re-encoding, which also prevents double-encoding existing `%xx` segments.
 */
export function normalizePathnameToCacheTag(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => {
      if (!segment) return segment

      try {
        return encodeURIComponent(decodeURIComponent(segment))
          .replace(/%5B/g, '[')
          .replace(/%5D/g, ']')
      } catch {
        return encodeURIComponent(segment)
          .replace(/%5B/g, '[')
          .replace(/%5D/g, ']')
      }
    })
    .join('/')
}
