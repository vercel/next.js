/** Decode UTF-8 route names without unescaping ASCII path delimiters or `%`. */
export function decodeNonAsciiPathname(pathname: string): string {
  return pathname.replace(/(?:%[89a-f][0-9a-f])+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  })
}
