// escape delimiters used by path-to-regexp
export default function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean
): string {
  if (typeof segment !== 'string') {
    throw new TypeError(
      `Expected a string for path segment but received ${typeof segment} instead. ` +
        'Make sure the params returned from getStaticPaths match the dynamic route.'
    )
  }

  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? '|%(2f|23|3f|5c)' : ''})`, 'gi'),
    (char: string) => encodeURIComponent(char)
  )
}
