import { djb2Hash } from '../../shared/lib/hash'

/**
 * Serializes a variant combination canonically, as its entries sorted by
 * variant identity and rendered as JSON.
 *
 * JSON rather than `key=value&…` because values are no longer restricted to a
 * charset that excludes the delimiters: they travel in a header now, not in a
 * path segment. A pair-array form stays unambiguous for any string, so two
 * different combinations cannot serialize alike and collide onto one prerender.
 *
 * Sorting by identity rather than accepting the order the values arrive in
 * matters because a module namespace orders its exports by export name, and
 * that is not the same order once each name is qualified with its module path:
 * `theme2@b.ts` sorts before `theme@a.ts`, while `theme` sorts before `theme2`.
 */
export function canonicalizeVariants(variants: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(variants)
      .sort()
      .map((key) => [key, variants[key]])
  )
}

/**
 * Hashes a combination's canonical form. Every hash goes through here so that
 * the callers below cannot drift apart: the build names files by hashing
 * values, the adapter names paths by hashing the transport form, and a
 * disagreement would mean a request looking up a prerender that exists under
 * another name.
 *
 * `djb2Hash` rather than a `node:crypto` digest because it is pure JavaScript
 * and therefore available wherever a cache key is composed, including the edge
 * runtime. It returns an unsigned 32-bit integer, so base 36 yields `[0-9a-z]+`
 * with no sign, which is what lets the prefix be recognized by shape.
 */
function hashCanonicalVariants(canonical: string): string {
  return djb2Hash(canonical).toString(36)
}

/**
 * Hashes a variant combination into the segment that identifies it, used both
 * in the request path and in the prerender's path on disk.
 *
 * The values themselves cannot be used: a combination's length is unbounded
 * whereas a path segment is not, and the value charset would have to exclude
 * everything illegal in a filename on every platform. The digest is never
 * reversed — the values reach the origin through `NEXT_VARIANTS_HEADER`
 * instead, which is what allows a combination nobody enumerated to still
 * render.
 */
export function hashVariants(variants: Record<string, string>): string {
  return hashCanonicalVariants(canonicalizeVariants(variants))
}

/**
 * Encodes a combination for transport in `NEXT_VARIANTS_HEADER`.
 *
 * Percent-encoding rather than base64 so the result is ASCII-safe for a header
 * value without needing `Buffer`, which is unavailable on the edge runtime
 * where the proxy runs.
 */
export function encodeVariants(variants: Record<string, string>): string {
  return encodeURIComponent(canonicalizeVariants(variants))
}

/**
 * Reverses `encodeVariants`.
 *
 * Returns null rather than throwing for anything malformed. The header is
 * internal and unforgeable from outside, so a bad value means a bug on our side
 * rather than hostile input, and a reader that reports the variant as
 * unresolved gives a better error than a parse failure deep in the request
 * pipeline.
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
