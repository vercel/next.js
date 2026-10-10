/**
 * Percent-encode every character other than horizontal tab and printable ASCII
 * so a value can be safely serialized into an HTTP header.
 *
 * Node's `validateHeaderValue` and `fetch`'s ByteString conversion accept
 * different character ranges. Restricting values to `\t\x20-\x7e` produces a
 * conservative representation that both can serialize. Characters outside a
 * transport's accepted range (Hebrew, Arabic, Chinese, emoji, …) would
 * otherwise throw `ERR_INVALID_CHAR` or a `TypeError`, which crashes ISR or
 * fails a cache read on every affected request.
 *
 * Cache tags are encoded at the public boundaries — tag construction
 * (`getImplicitTags`, `validateTags`) and invalidation input
 * (`revalidatePath`, `revalidateTag`, `updateTag`) — so storage, comparison,
 * and the wire all see the same canonical form.
 *
 * The class is narrower than either transport accepts. Everything inside it
 * passes through byte-for-byte, including `,`, `/`, `%`, `[`, `]`, `_`, `-` and
 * `\t`, which preserves the comma-separated header format and the
 * dynamic-segment markers in derived tags (`_N_T_/[slug]/page`).
 *
 * Properties:
 * - Fast-path: input that already fits the class is returned unchanged. This
 *   makes the encoder idempotent on already-encoded `%xx` sequences.
 * - Matches *runs* of out-of-class code units so surrogate pairs (e.g. an
 *   emoji) are handed to `encodeURIComponent` as a complete code point — a
 *   per-code-unit regex would split the pair and throw `URIError`.
 */
const OUT_OF_CLASS_CHAR = /[^\t\x20-\x7e]/
const OUT_OF_CLASS_RUN = /[^\t\x20-\x7e]+/g

export function encodeHeaderSafe(value: string): string {
  return OUT_OF_CLASS_CHAR.test(value)
    ? value.replace(OUT_OF_CLASS_RUN, (run) => encodeURIComponent(run))
    : value
}
