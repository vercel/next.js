import { hexHash } from '../../hash'

export function computeCacheBustingSearchParam(
  prefetchHeader: string | string[] | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): string | null {
  if (
    prefetchHeader === undefined &&
    segmentPrefetchHeader === undefined &&
    stateTreeHeader === undefined &&
    nextUrlHeader === undefined
  ) {
    return null
  }
  return hexHash(
    [
      prefetchHeader || '0',
      segmentPrefetchHeader || '0',
      stateTreeHeader || '0',
      nextUrlHeader || '0',
    ].join(',')
  )
}
