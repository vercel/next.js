/**
 * An invalid `experimental.turbopackChunkingPriorities` key: a route that does
 * not match any real route in the project, optionally with a "did you mean"
 * suggestion for the closest known route.
 */
export interface InvalidChunkingPriority {
  key: string
  suggestion: string | undefined
}

/**
 * Computes the Levenshtein edit distance between two strings. Used to suggest a
 * "did you mean" route for a mistyped key in
 * `experimental.turbopackChunkingPriorities`.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let prev = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    const curr = new Array<number>(n + 1)
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }

  return prev[n]
}

/**
 * Returns the closest route to `key` from `validRoutes`, but only when it is
 * close enough to plausibly be a typo.
 */
function findClosestRoute(
  key: string,
  validRoutes: Iterable<string>
): string | undefined {
  let best: string | undefined
  let bestDistance = Infinity

  for (const route of validRoutes) {
    const distance = levenshtein(key, route)
    if (distance < bestDistance) {
      bestDistance = distance
      best = route
    }
  }

  if (best === undefined) return undefined

  // Only suggest when the edit distance is small relative to the key length.
  const threshold = Math.max(2, Math.floor(key.length / 3))
  return bestDistance <= threshold ? best : undefined
}

/**
 * Validates the keys of `experimental.turbopackChunkingPriorities` against the
 * set of real route pathnames in the project and returns the keys that don't
 * match any route.
 *
 * @param priorities - The `experimental.turbopackChunkingPriorities` config value.
 * @param validRoutes - Every valid route pathname in the project (app + pages).
 * @returns The invalid keys, each with a "did you mean" suggestion when one is close.
 */
export function findInvalidChunkingPriorities(
  priorities: Record<string, 'low' | 'medium' | 'high'> | undefined,
  validRoutes: Iterable<string>
): InvalidChunkingPriority[] {
  if (!priorities) return []

  const keys = Object.keys(priorities)
  if (keys.length === 0) return []

  const valid = new Set(validRoutes)

  const invalid: InvalidChunkingPriority[] = []
  for (const key of keys) {
    if (!valid.has(key)) {
      invalid.push({ key, suggestion: findClosestRoute(key, valid) })
    }
  }

  return invalid
}
