/**
 * Convert a URL search string into a Record matching the shape produced by
 * the server-side `searchParams` prop in App Router pages.
 *
 * Repeated keys are preserved as arrays:
 *   ""               -> {}
 *   "a=1"            -> { a: "1" }
 *   "a=1&a=2"        -> { a: ["1", "2"] }
 *   "a=1&b=2&a=3"    -> { a: ["1", "3"], b: "2" }
 *
 * Must mirror how the server constructs `searchParams` before passing them to
 * `addSearchParamsIfPageSegment`. If client and server diverge, page segment
 * cache keys collide for URLs that should be cached separately (issue #92152).
 */
export function searchStringToRecord(
  search: string
): Record<string, string | string[]> {
  const params = new URLSearchParams(search)
  const result: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key)
    result[key] = values.length === 1 ? values[0] : values
  }
  return result
}
