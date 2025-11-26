export function getRevalidateReason(params: {
  isOnDemandRevalidate?: boolean
  isStaticGeneration?: boolean
}): 'on-demand' | 'stale' | undefined {
  if (params.isOnDemandRevalidate) {
    return 'on-demand'
  }
  if (params.isStaticGeneration) {
    return 'stale'
  }
  return undefined
}
