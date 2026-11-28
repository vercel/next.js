/**
 * Compound cache keys for the minimal-mode response cache.
 *
 * A key is `pathname` + `KEY_SEPARATOR` + an invocation scope. Requests that
 * do not supply an invocation id share the TTL slot, which is the slot the
 * expiry and cached-failure checks apply to.
 *
 * The invocation id is read from the `x-invocation-id` request header, which is
 * NOT a member of `INTERNAL_HEADERS`, so `filterInternalHeaders()` leaves it in
 * place and any external client can set it. Everything in this module therefore
 * treats that value as untrusted input.
 */

/**
 * Separator used in compound cache keys to join pathname and invocationID.
 * Using null byte (\0) since it cannot appear in valid URL paths or UUIDs.
 */
const KEY_SEPARATOR = '\0'

/**
 * Sentinel value used for TTL-based cache entries (when invocationID is undefined).
 * Chosen to be a clearly reserved marker for internal cache keys.
 */
export const TTL_SENTINEL = '__ttl_sentinel__'

/**
 * Shape accepted for an invocation id.
 *
 * The hosting-platform contract for `x-invocation-id` is not visible from this
 * repository, so this is deliberately a permissive superset of any
 * platform-shaped id: bounded length, no separators, no control characters.
 * It exists to stop a client from choosing an arbitrary key namespace, not to
 * pin the provider's exact format.
 */
const INVOCATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

type InvocationIDHeaderValue = string | readonly string[] | undefined

/**
 * Validates a client-supplied `x-invocation-id` before it becomes part of a
 * cache key.
 *
 * Without this, a client sending `x-invocation-id: __ttl_sentinel__` produces
 * the same compound key as a request that sent no id at all, while taking the
 * "always a hit" branch that skips the expiry check and the cached-failure
 * exclusion that the no-id path is subject to.
 *
 * The reserved sentinel, empty values, and anything outside the accepted shape
 * are treated as "no id supplied" rather than as an error, so a rejected value
 * routes the request through the existing no-id (TTL) code path instead of
 * throwing.
 */
export function getValidatedInvocationID(
  value: InvocationIDHeaderValue
): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  // `TTL_SENTINEL` is reserved: it is how the no-id slot is spelled, and never
  // a legitimate invocation id.
  if (value === '' || value === TTL_SENTINEL) {
    return undefined
  }

  if (!INVOCATION_ID_PATTERN.test(value)) {
    return undefined
  }

  return value
}

/**
 * Creates a compound cache key from pathname and invocationID.
 */
export function createCacheKey(
  pathname: string,
  invocationID: string | undefined
): string {
  return `${pathname}${KEY_SEPARATOR}${invocationID ?? TTL_SENTINEL}`
}

/**
 * Extracts the invocationID from a compound cache key.
 * Returns undefined if the key used TTL_SENTINEL.
 */
export function extractInvocationID(compoundKey: string): string | undefined {
  const separatorIndex = compoundKey.lastIndexOf(KEY_SEPARATOR)
  if (separatorIndex === -1) return undefined

  const invocationID = compoundKey.slice(separatorIndex + 1)
  return invocationID === TTL_SENTINEL ? undefined : invocationID
}
