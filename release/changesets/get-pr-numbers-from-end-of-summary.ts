/**
 * @example
 * getPrNumbersAtEnd('feat: add new feature #123, #456') // ['123', '456']
 * getPrNumbersAtEnd('feat: add new feature') // null
 * getPrNumbersAtEnd('Revert "Revert #123" #456') // ['456']
 */
export function getPrNumbersFromEndOfSummary(summary: string): string[] | null {
  const prNumbersAtEnd = summary.match(/\s+#\d+(?:,\s*#\d+)*\s*$/)
  if (prNumbersAtEnd) {
    const prNumbers = prNumbersAtEnd[0].match(/#\d+/g)
    if (prNumbers) {
      return prNumbers.map((num) => num.replace('#', ''))
    }
  }
  return null
}
