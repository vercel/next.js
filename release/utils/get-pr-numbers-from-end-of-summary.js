/**
 * @param {string} summary
 * @returns {string[] | null}
 * @example
 * getPrNumbersAtEnd('feat: add new feature #123, #456') // ['123', '456']
 * getPrNumbersAtEnd('feat: add new feature') // null
 * getPrNumbersAtEnd('Revert "Revert #123" #456') // ['456']
 */
export function getPrNumbersFromEndOfSummary(summary) {
  const prNumbersAtEnd = summary.match(/\s+#\d+(?:,\s*#\d+)*\s*$/)
  if (prNumbersAtEnd) {
    return prNumbersAtEnd[0].match(/#\d+/g).map((num) => num.replace('#', ''))
  }
  return null
}
