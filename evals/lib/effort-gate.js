function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function evaluateEffortGate(baseline, skills, minimumReduction = 0.4) {
  if (baseline.length !== 5 || skills.length !== 5) {
    throw new Error('Effort gate requires five baseline and skill samples')
  }
  if (
    [...baseline, ...skills].some(
      (sample) =>
        !Number.isFinite(sample.inputTokens) || sample.inputTokens <= 0
    )
  ) {
    throw new Error('Effort gate requires positive input token counts')
  }

  const baselineMedian = median(baseline.map((sample) => sample.inputTokens))
  const skillsMedian = median(skills.map((sample) => sample.inputTokens))
  const reduction = 1 - skillsMedian / baselineMedian
  const baselinePasses = baseline.filter(
    (sample) => sample.status === 'passed'
  ).length
  const skillsPasses = skills.filter(
    (sample) => sample.status === 'passed'
  ).length

  return {
    passed: skillsPasses >= baselinePasses && reduction >= minimumReduction,
    baselineMedian,
    skillsMedian,
    reduction,
    baselinePasses,
    skillsPasses,
  }
}

module.exports = { evaluateEffortGate }
