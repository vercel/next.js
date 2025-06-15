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
 * Only XML-safe entities (&amp;, &lt;, &gt;, &quot;, &apos;) are allowed.
 * Others like &copy; or &nbsp; are escaped to prevent invalid XML.

 * - Prevents double-escaping of known entities like &amp;
 */

const xmlEscapeMap: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&apos;',
  '"': '&quot;',
}

function escapeXmlValue(input: string): string {
  return input.replace(
    /&(?!(?:amp|lt|gt|quot|apos);)|[<>'"]/g,
    (char) => xmlEscapeMap[char] || char
  )
}

export { resolveAsArrayOrUndefined, resolveArray, getOrigin, escapeXmlValue }
