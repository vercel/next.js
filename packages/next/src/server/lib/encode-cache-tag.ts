/**
 * Percent-encode every character outside printable ASCII so a tag value can be
 * safely serialized as part of the `x-next-cache-tags` HTTP header.
 *
 * Node's `validateHeaderValue` rejects any code unit outside `\t\x20-\x7e`, so
 * a matched route path or user-supplied tag containing a non-ASCII character
 * (Hebrew, Arabic, Chinese, emoji, …) would otherwise throw `ERR_INVALID_CHAR`
 * and crash ISR on every affected request.
 *
 * This is applied at the public boundaries — tag construction
 * (`getImplicitTags`, `validateTags`) and invalidation input (`revalidatePath`,
 * `revalidateTag`, `updateTag`) — so storage, comparison, and the wire all see
 * the same canonical ASCII-safe form.
 *
 * The character class `[\t\x20-\x7e]` mirrors Node's `validHdrChars` table —
 * `\t` plus printable ASCII through `~`. Anything outside that is rejected
 * by `validateHeaderValue`, so we encode runs of those characters and leave
 * everything else (`,`, `/`, `%`, `[`, `]`, `_`, `-`, `\t`, …) byte-for-byte
 * unchanged. This preserves the comma-separated header format and the
 * dynamic-segment markers in derived tags (`_N_T_/[slug]/page`).
 *
 * Properties:
 * - Fast-path: input that already fits the validation class is returned
 *   unchanged. This makes the encoder idempotent on already-encoded `%xx`
 *   sequences.
 * - Matches *runs* of out-of-class code units so surrogate pairs (e.g. an
 *   emoji) are handed to `encodeURIComponent` as a complete code point — a
 *   per-code-unit regex would split the pair and throw `URIError`.
 */
const OUT_OF_CLASS_CHAR = /[^\t\x20-\x7e]/
const OUT_OF_CLASS_RUN = /[^\t\x20-\x7e]+/g

export function encodeCacheTag(tag: string): string {
  return OUT_OF_CLASS_CHAR.test(tag)
    ? tag.replace(OUT_OF_CLASS_RUN, (run) => encodeURIComponent(run))
    : tag
}
