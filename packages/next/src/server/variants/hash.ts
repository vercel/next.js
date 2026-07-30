import { djb2Hash } from '../../shared/lib/hash'

/**
 * Renders a resolved variant combination in its canonical form: `key=value`
 * pairs joined by `&`, sorted by key.
 *
 * Sorting is what makes the form independent of the order the values were
 * produced in, so that the same combination always yields the same hash no
 * matter which side computed it.
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
