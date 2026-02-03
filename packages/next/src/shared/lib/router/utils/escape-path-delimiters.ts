// escape delimiters used by path-to-regexp
export default function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean
): string {
  if (typeof segment !== 'string') {
    throw new Error(
      `A path segment must be a string, received ${typeof segment} (${JSON.stringify(segment)}). ` +
        `This typically happens when a non-string value is passed to getStaticPaths. ` +
        `Make sure all path parameters are strings.`
    )
  }

  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? '|%(2f|23|3f|5c)' : ''})`, 'gi'),
    (char: string) => encodeURIComponent(char)
  )
}
