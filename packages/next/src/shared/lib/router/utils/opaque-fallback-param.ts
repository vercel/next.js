// Fallback shells are rendered without concrete values for some route params.
// Those params get an opaque placeholder value, which also becomes the param's
// key in the rendered router tree. This module owns the placeholder format so
// the client can recognize such keys.

const OPAQUE_FALLBACK_PARAM_PREFIX = '%%drp:'
const OPAQUE_FALLBACK_PARAM_SUFFIX = '%%'

/**
 * Creates the opaque placeholder value for a fallback route param.
 */
export function createOpaqueFallbackParamValue(
  paramName: string,
  uniqueID: string
): string {
  return `${OPAQUE_FALLBACK_PARAM_PREFIX}${paramName}:${uniqueID}${OPAQUE_FALLBACK_PARAM_SUFFIX}`
}

/**
 * Whether a router tree param key is an opaque fallback placeholder rather
 * than a concrete param value.
 *
 * This can't match a concrete value. The server encodes concrete values with
 * `encodeURIComponent`, which never produces `%%`: every `%` in its output
 * starts a percent-encoded byte (two hex digits).
 */
export function isOpaqueFallbackParamKey(key: string): boolean {
  return (
    key.startsWith(OPAQUE_FALLBACK_PARAM_PREFIX) &&
    key.endsWith(OPAQUE_FALLBACK_PARAM_SUFFIX)
  )
}
