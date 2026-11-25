function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

// Crashed or timed-out runs have no token count; they still count against the pass rate.
function medianInputTokens(samples) {
  const tokens = samples
    .map((sample) => sample.inputTokens)
    .filter((value) => Number.isFinite(value) && value > 0)
  return tokens.length === 0 ? null : median(tokens)
}

/** @param {Record<string, Array<{ status: string, inputTokens?: number | null }>>} samples keyed by variant suffix */
function evaluateEffortGate(samples, minimumReduction = 0.4) {
  const baselineMedian = medianInputTokens(samples.baseline)
  const variants = Object.fromEntries(
    Object.entries(samples).map(([suffix, variantSamples]) => {
      const variantMedian = medianInputTokens(variantSamples)
      return [
        suffix,
        {
          medianInputTokens: variantMedian,
          reduction:
            variantMedian === null || baselineMedian === null
              ? null
              : 1 - variantMedian / baselineMedian,
          passes: variantSamples.filter(({ status }) => status === 'passed')
            .length,
        },
      ]
    })
  )
  const { baseline, skills } = variants
  return {
    passed:
      skills.reduction !== null &&
      skills.passes >= baseline.passes &&
      skills.reduction >= minimumReduction,
    minimumReduction,
    sampleCount: samples.baseline.length,
    variants,
  }
}

module.exports = { evaluateEffortGate }
