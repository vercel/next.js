/**
 * Serializes the variants resolved for a request to a canonical form. The
 * entries are sorted by variant identity and written as JSON.
 *
 * The form is JSON and not `key=value&…`, because a value can contain a
 * delimiter. Values travel in a header, so they are not restricted to a charset
 * that excludes one, and an array of pairs stays unambiguous for any string.
 *
 * The entries are sorted by identity, and not left in the order they arrive in.
 * A module namespace orders its exports by export name, and that order changes
 * when each name is qualified with its module path. For example, `theme2@b.ts`
 * sorts before `theme@a.ts`, but `theme` sorts before `theme2`. Anything derived
 * from this form therefore has one spelling per set of values.
 */
export function canonicalizeVariants(variants: Record<string, string>): string {
  return JSON.stringify(
    Object.keys(variants)
      .sort()
      .map((key) => [key, variants[key]])
  )
}

/**
 * Encodes the resolved variants for transport in `NEXT_VARIANTS_HEADER`.
 *
 * This function percent-encodes the whole canonical form. The result holds only
 * unreserved ASCII and `%xx` escapes, which is inside `\t\x20-\x7e`. Node's
 * header validation and the ByteString conversion of `fetch` both accept that
 * class. A variant value can therefore be any string, an emoji or a
 * right-to-left script included.
 *
 * `encodeHeaderSafe` produces the same class with fewer escapes. This function
 * does not use it. That function escapes only what it must, and leaves a
 * literal `%` unchanged, so its result is not reversible:
 *
 * - `50%` fails to decode.
 * - `100%2F` decodes to `100/`.
 *
 * Its own callers want that property, because they compare a canonical form.
 * This encoding must reverse exactly, so it escapes every character. The result
 * is about 1.6 times longer.
 *
 * This function uses percent-encoding and not base64, because base64 needs
 * `Buffer`. The edge runtime that a proxy can run on has no `Buffer`.
 */
export function encodeVariants(variants: Record<string, string>): string {
  return encodeURIComponent(canonicalizeVariants(variants))
}

/**
 * Reverses `encodeVariants`.
 *
 * The function returns null for malformed input, and does not throw. Next.js
 * strips this header from an incoming client request, so a bad value is a bug on
 * our side rather than hostile input. A reader that reports the variant as unresolved
 * gives a better error than a parse failure deep in the request pipeline.
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
