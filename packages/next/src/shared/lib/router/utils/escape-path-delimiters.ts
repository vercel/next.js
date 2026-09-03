// escape delimiters used by path-to-regexp
export default function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean
): string {
  if (typeof segment !== 'string') {
    throw new Error(
      `Expected segment to be a string, but received ${typeof segment}. This can happen if a non-string value is provided in getStaticPaths.`
    )
  }
  return segment.replace(
    new RegExp(`([/#?\\\\]${escapeEncoded ? '|%(2f|23|3f|5c)' : ''})`, 'gi'),
    (char: string) => encodeURIComponent(char)
  )
}
