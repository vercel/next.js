/**
 * Merge two `Vary` header values into a single comma-separated string,
 * de-duplicating entries case-insensitively while preserving the original
 * casing and order of the first occurrence.
 *
 * The App Router computes its own `Vary` value (the RSC navigation headers)
 * and must combine it with any value already present on the response, for
 * example a `Vary` set by middleware. Overwriting drops the middleware value
 * and breaks CDN cache keying. See:
 * https://github.com/vercel/next.js/issues/85999
 *
 * A raw Node `ServerResponse.appendHeader` does not de-duplicate values, so
 * callers read the existing value, merge it here, then set the result.
 *
 * This only de-duplicates; it does not validate field names. Callers must
 * write the result through a header setter that rejects control characters
 * (Node `ServerResponse`/WHATWG `Headers` both do), which all current call
 * sites do.
 *
 *   mergeVary('RSC, Next-Router-State-Tree', 'X-Foo')
 *     // -> 'RSC, Next-Router-State-Tree, X-Foo'
 *   mergeVary('rsc', 'RSC, X-Foo')   // case-insensitive de-dup
 *     // -> 'rsc, X-Foo'
 */
export function mergeVary(
  existing: string | number | string[] | null | undefined,
  incoming: string | number | string[] | null | undefined
): string {
  const seen = new Set<string>()
  const merged: string[] = []

  const add = (value: string | number | string[] | null | undefined) => {
    if (value === null || value === undefined) return
    const parts = Array.isArray(value) ? value : [value]
    for (const part of parts) {
      for (const entry of String(part).split(',')) {
        const trimmed = entry.trim()
        if (!trimmed) continue
        const key = trimmed.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        merged.push(trimmed)
      }
    }
  }

  add(existing)
  add(incoming)

  // `*` is kept as an ordinary token rather than collapsing the whole header
  // to `*`: the computed value can include specific field names (such as
  // `Next-URL`) that Next reads back with `vary.includes(...)`, so dropping
  // them would change routing/cache behavior.
  return merged.join(', ')
}
