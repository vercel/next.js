export function getRevalidateReason(params: {
  isOnDemandRevalidate?: boolean
  isRevalidate?: boolean
}): 'on-demand' | 'stale' | undefined {
  if (params.isOnDemandRevalidate) {
    return 'on-demand'
  }
  if (params.isRevalidate) {
    return 'stale'
  }
  return undefined
}
