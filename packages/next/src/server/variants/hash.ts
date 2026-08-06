import { djb2Hash } from '../../shared/lib/hash'

/**
 * Serializes a variant combination to a canonical form. The entries are sorted
 * by variant identity and written as JSON.
 *
 * The form is JSON and not `key=value&…`, because a value can contain a
 * delimiter. Values travel in a header now, not in a path segment, so they are
 * no longer restricted to a charset that excludes one. An array of pairs stays
 * unambiguous for any string. Therefore two different combinations cannot
 * serialize to the same text and collide on one prerender.
 *
 * The entries are sorted by identity, and not left in the order they arrive in.
 * A module namespace orders its exports by export name, and that order changes
 * when each name is qualified with its module path. For example, `theme2@b.ts`
 * sorts before `theme@a.ts`, but `theme` sorts before `theme2`.
 */
export function canonicalizeVariants(variants: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(variants)
      .sort()
      .map((key) => [key, variants[key]])
  )
}

/**
 * Hashes the canonical form of a combination.
 *
 * Every hash goes through this function, so that the callers cannot disagree.
 * The build names files by hashing values, and the adapter names paths by
 * hashing the transport form. If the two disagreed, a request would look up a
 * prerender that exists under another name.
 *
 * The function uses `djb2Hash` and not a `node:crypto` digest. `djb2Hash` is
 * pure JavaScript, and is therefore available wherever a cache key is composed,
 * including the edge runtime. It returns an unsigned 32-bit integer, so base 36
 * gives `[0-9a-z]+` with no sign. That is what lets other code recognize the
 * prefix by its shape.
 */
function hashCanonicalVariants(canonical: string): string {
  return djb2Hash(canonical).toString(36)
}

/**
 * Hashes a variant combination into the segment that identifies it. The segment
 * is used in the request path and in the path of the prerender on disk.
 *
 * The values cannot be used directly. A combination has no length limit, but a
 * path segment does, and the value charset would have to exclude every
 * character that is illegal in a filename on any platform. Nothing reverses the
 * digest. The values reach the origin in `NEXT_VARIANTS_HEADER` instead, which
 * is what lets a combination that nobody enumerated still render.
 */
export function hashVariants(variants: Record<string, string>): string {
  return hashCanonicalVariants(canonicalizeVariants(variants))
}

/**
 * Encodes a combination for transport in `NEXT_VARIANTS_HEADER`.
 *
 * The function uses percent-encoding and not base64. The result is then safe
 * ASCII for a header value, and the function does not need `Buffer`, which the
 * edge runtime that the proxy runs on does not have.
 */
export function encodeVariants(variants: Record<string, string>): string {
  return encodeURIComponent(canonicalizeVariants(variants))
}

/**
 * Reverses `encodeVariants`.
 *
 * The function returns null for malformed input, and does not throw. The header
 * is internal, and a client cannot set it, so a bad value is a bug on our side
 * and not hostile input. A reader that reports the variant as unresolved gives
 * a better error than a parse failure deep in the request pipeline.
 */
export function decodeVariants(encoded: string): Record<string, string> | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(decodeURIComponent(encoded))
  } catch {
    return null
  }

  if (!Array.isArray(parsed)) {
    return null
  }

  const variants: Record<string, string> = {}

  for (const entry of parsed) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      typeof entry[1] !== 'string'
    ) {
      return null
    }

    variants[entry[0]] = entry[1]
  }

  return variants
}
