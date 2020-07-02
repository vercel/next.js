// escape delimiters used by path-to-regexp
export default function escapePathDelimiter(segment: string): string {
  return segment.replace(/[/#?]/g, (char: string) => encodeURIComponent(char))
}
