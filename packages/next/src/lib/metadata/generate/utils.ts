function resolveArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value as any
  }
  return [value] as any
}

function resolveAsArrayOrUndefined<T>(
  value: T | T[] | undefined | null
): T extends undefined | null ? undefined : T[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined as any
  }
  return resolveArray(value) as any
}

function getOrigin(url: string | URL): string | undefined {
  let origin = undefined
  if (typeof url === 'string') {
    try {
      url = new URL(url)
      origin = url.origin
    } catch {}
  }
  return origin
}

/**
 * Normalizes a metadata string value by stripping carriage return characters.
 * This prevents duplicate meta tags caused by CRLF line endings in metadata.
 *
 * @see https://github.com/vercel/next.js/issues/93089
 */
function normalizeMetadataString<T extends string | null | undefined>(
  value: T
): T {
  if (typeof value === 'string') {
    return value.replace(/\r/g, '') as T
  }
  return value
}

export {
  resolveAsArrayOrUndefined,
  resolveArray,
  getOrigin,
  normalizeMetadataString,
}
