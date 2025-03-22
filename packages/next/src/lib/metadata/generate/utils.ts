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
 * Escapes a string for safe inclusion in XML.
 * - Escapes &, <, >, ", '
 * - Prevents double-escaping of known entities like &amp;
 */
function escapeXmlValue(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;')
}

export { resolveAsArrayOrUndefined, resolveArray, getOrigin, escapeXmlValue }
