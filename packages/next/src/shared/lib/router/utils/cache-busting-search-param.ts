import { hexHash } from '../../hash'

export function computeCacheBustingSearchParam(
  prefetchHeader: '1' | '2' | '0' | undefined,
  segmentPrefetchHeader: string | string[] | undefined,
  stateTreeHeader: string | string[] | undefined,
  nextUrlHeader: string | string[] | undefined
): string {
  if (
    (prefetchHeader === undefined || prefetchHeader === '0') &&
    segmentPrefetchHeader === undefined &&
    stateTreeHeader === undefined &&
    nextUrlHeader === undefined
  ) {
    return ''
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
