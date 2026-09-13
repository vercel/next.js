/** Returns whether a value is one exact canonical HTTP(S) origin. */
export function isExactWebSocketOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.hostname.includes('*') &&
      url.origin === value
    )
  } catch {
    return false
  }
}
