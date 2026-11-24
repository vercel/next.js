function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

// Crashed or timed-out runs have no token count; they still count against the pass rate.
function medianTokens(samples) {
  const tokens = samples
    .map((sample) => sample.inputTokens)
    .filter((value) => Number.isFinite(value) && value > 0)
  return tokens.length === 0 ? null : median(tokens)
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
  const baselineMedian = medianTokens(baseline)
  const agentsMdMedian = medianTokens(agentsMd)
  const skillsMedian = medianTokens(skills)
  const reduction = (value) =>
    value === null || baselineMedian === null
      ? null
      : 1 - value / baselineMedian
  const agentsMdReduction = reduction(agentsMdMedian)
  const skillsReduction = reduction(skillsMedian)
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
      skillsReduction !== null &&
      skillsPasses >= baselinePasses &&
      skillsReduction >= minimumReduction,
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
