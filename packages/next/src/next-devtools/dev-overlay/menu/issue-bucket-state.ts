export type IssueBucketState = {
  hasNormal: boolean
  hasInstant: boolean
  hasAny: boolean
  insightsOnly: boolean
  variant: 'issue' | 'insight'
}

export function getIssueBucketState(
  normalErrorCount: number,
  instantErrorCount: number
): IssueBucketState {
  const hasNormal = normalErrorCount > 0
  const hasInstant = instantErrorCount > 0
  const insightsOnly = !hasNormal && hasInstant
  return {
    hasNormal,
    hasInstant,
    hasAny: hasNormal || hasInstant,
    insightsOnly,
    variant: insightsOnly ? 'insight' : 'issue',
  }
}
