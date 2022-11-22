// escape delimiters used by path-to-regexp
export default function escapePathDelimiters(
  segment: string,
  escapeEncoded?: boolean
): string {
  return segment.replace(
    new RegExp(`([/#?]${escapeEncoded ? '|%(2f|23|3f)' : ''})`, 'gi'),
    (char: string) => encodeURIComponent(char)
  )
}
