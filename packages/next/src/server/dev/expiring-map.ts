/**
 * Default lifetime for dev-server HTML handoff entries. The HMR websocket
 * connects within milliseconds of a real page load; entries whose client
 * never connects (curl, no-JS crawlers, failed hydration) would otherwise be
 * retained forever.
 */
export const HTML_REQUEST_HANDOFF_TTL_MS = 60_000

/**
 * Sets a map entry that is automatically deleted after `ttlMs` unless it is
 * consumed (or replaced) first. The timer is unref'd so it never keeps the
 * process alive, and the identity check ensures a newer value for the same
 * key is never deleted by a stale timer.
 */
export function setWithExpiry<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  ttlMs: number = HTML_REQUEST_HANDOFF_TTL_MS
): void {
  const timer = setTimeout(() => {
    if (map.get(key) === value) {
      map.delete(key)
    }
  }, ttlMs)
  timer.unref?.()
  map.set(key, value)
}
