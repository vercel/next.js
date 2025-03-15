/**
 * Decodes a query path parameter.
 *
 * @param value - The value to decode.
 * @returns The decoded value.
 */
export function decodeQueryPathParameter(value: string) {
  // When deployed to Vercel, the value may be encoded, so this attempts to
  // decode it and returns the original value if it fails.
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
