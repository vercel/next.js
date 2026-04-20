// escape delimiters used by path-to-regexp
export default function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean
): string {
  if (typeof segment !== 'string') {
    throw new Error(
      `A required parameter was not provided as a string received ${typeof segment === 'object' ? JSON.stringify(segment) : segment} (${typeof segment}). All path parameters in getStaticPaths must be strings.`
    )
  }

  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? '|%(2f|23|3f|5c)' : ''})`, 'gi'),
    (char: string) => encodeURIComponent(char)
  )
}
