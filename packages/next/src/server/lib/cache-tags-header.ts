/**
 * Percent-encode every character outside printable ASCII in an
 * `x-next-cache-tags` header value so it can be safely serialized over HTTP.
 *
 * Node's `validateHeaderValue` rejects any code unit outside `\t\x20-\x7e`,
 * so a matched route path containing a non-ASCII character (Hebrew, Arabic,
 * Chinese, emoji, …) would otherwise throw `ERR_INVALID_CHAR` and crash ISR
 * on every affected request.
 *
 * ASCII (including `,`, `/`, and `%`) is left byte-for-byte unchanged so the
 * comma-separated format and tag contents round-trip unchanged for downstream
 * consumers. Internal tag storage and tag comparison (`getImplicitTags`,
 * `revalidatePath`, cache-handler keys) still use the raw string — this
 * encoding only applies when the value crosses the HTTP wire.
 */
export function encodeCacheTagsHeaderValue(value: string): string {
  // Match *runs* of non-ASCII code units so that a surrogate pair (e.g. an
  // emoji) is handed to `encodeURIComponent` as a complete code point. A
  // per-code-unit regex would split the pair and throw `URIError`.
  return /[^\x20-\x7e]/.test(value)
    ? value.replace(/[^\x20-\x7e]+/g, (run) => encodeURIComponent(run))
    : value
}
