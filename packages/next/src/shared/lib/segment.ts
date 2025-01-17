import type { Segment } from '../../server/app-render/types'

export function isGroupSegment(segment: string) {
  // Use array[0] for performant purpose
  return segment[0] === '(' && segment.endsWith(')')
}

export function isParallelRouteSegment(segment: string) {
  return segment.startsWith('@') && segment !== '@children'
}

export function addSearchParamsIfPageSegment(
  segment: Segment,
  searchParams: Record<string, string | string[] | undefined>
) {
  const isPageSegment = segment.includes(PAGE_SEGMENT_KEY)

  if (isPageSegment) {
    const stringifiedQuery = JSON.stringify(searchParams)
    return stringifiedQuery !== '{}'
      ? PAGE_SEGMENT_KEY + '?' + stringifiedQuery
      : PAGE_SEGMENT_KEY
  }

  return segment
}

export const PAGE_SEGMENT_KEY = '__PAGE__'
export const DEFAULT_SEGMENT_KEY = '__DEFAULT__'
