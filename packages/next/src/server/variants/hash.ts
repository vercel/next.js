import { djb2Hash } from '../../shared/lib/hash'

/**
 * Renders a resolved variant combination in its canonical form: `key=value`
 * pairs joined by `&`, sorted by variant identity.
 *
 * One form serves both the packed URL segment and the input to the prerender
 * hash, so that the proxy (which packs a combination per request) and the build
 * (which emits prerendered combinations) cannot order the same combination
 * differently and address two different paths for it.
 *
 * Sorting by identity rather than accepting the order the values arrive in
 * matters because a module namespace orders its exports by export name, and
 * that is not the same order once each name is qualified with its module path:
 * `theme2@b.ts` sorts before `theme@a.ts`, while `theme` sorts before `theme2`.
 *
 * The pairs are joined literally rather than through
 * `URLSearchParams.toString()`, which would percent-encode the `:` in a variant
 * identity and require decoding it back. Identities and values are validated
 * against a charset excluding `&`, `=`, `%`, `/`, and `+`, so the result needs
 * no encoding and round-trips through `new URLSearchParams(segment)` unchanged.
 */
export function canonicalizeVariants(variants: Record<string, string>): string {
  return Object.keys(variants)
    .sort()
    .map((key) => `${key}=${variants[key]}`)
    .join('&')
}

/**
 * Hashes a variant combination into the segment that identifies its prerender
 * on disk, under `.next/server/app/__variants/<hash>/`.
 *
 * The values cannot be used directly the way they are in the URL: the allowed
 * value charset includes characters that are illegal in Windows filenames, and
 * a combination's length is unbounded, whereas a path segment is not. The
 * digest is never reversed. Every consumer goes values → hash → path, and asks
 * the prerender manifest when it needs to go the other way.
 *
 * The build (naming files) and the runtime (finding them) compute this
 * independently, so both must agree exactly. `djb2Hash` is used rather than a
 * `node:crypto` digest because it is pure JavaScript and therefore available
 * wherever a cache key is composed, including the edge runtime.
 */
export function hashVariants(variants: Record<string, string>): string {
  return djb2Hash(canonicalizeVariants(variants)).toString(36)
}
