function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function evaluateEffortGate(
  baseline,
  agentsMd,
  skills,
  minimumReduction = 0.4
) {
  if (
    baseline.length === 0 ||
    agentsMd.length !== baseline.length ||
    skills.length !== baseline.length
  ) {
    throw new Error(
      'Effort gate requires equal, non-empty baseline, agents-md, and skill samples'
    )
  }
  if (
    [...baseline, ...agentsMd, ...skills].some(
      (sample) =>
        !Number.isFinite(sample.inputTokens) || sample.inputTokens <= 0
    )
  ) {
    throw new Error('Effort gate requires positive input token counts')
  }

  const baselineMedian = median(baseline.map((sample) => sample.inputTokens))
  const agentsMdMedian = median(agentsMd.map((sample) => sample.inputTokens))
  const skillsMedian = median(skills.map((sample) => sample.inputTokens))
  const agentsMdReduction = 1 - agentsMdMedian / baselineMedian
  const skillsReduction = 1 - skillsMedian / baselineMedian
  const baselinePasses = baseline.filter(
    (sample) => sample.status === 'passed'
  ).length
  const agentsMdPasses = agentsMd.filter(
    (sample) => sample.status === 'passed'
  ).length
  const skillsPasses = skills.filter(
    (sample) => sample.status === 'passed'
  ).length

  return {
    passed:
      skillsPasses >= baselinePasses && skillsReduction >= minimumReduction,
    baselineMedian,
    agentsMdMedian,
    skillsMedian,
    agentsMdReduction,
    skillsReduction,
    baselinePasses,
    agentsMdPasses,
    skillsPasses,
    sampleCount: baseline.length,
  }
}

module.exports = { evaluateEffortGate }
