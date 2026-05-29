/**
 * Shared statistics utilities for benchmark measurements
 */

/**
 * Calculate statistical summary for an array of numbers
 * @param {number[]} arr - Array of numeric values
 * @returns {Object|null} Stats object with median, min, max, mean, stddev, cv or null if empty
 */
function calcStats(arr) {
  if (arr.length === 0) return null

  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance =
    arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length
  const stddev = Math.sqrt(variance)
  const cv = mean > 0 ? (stddev / mean) * 100 : 0 // coefficient of variation as %

  return {
    median,
    min,
    max,
    mean: Math.round(mean),
    stddev: Math.round(stddev),
    cv: Math.round(cv),
  }
}

module.exports = { calcStats }
