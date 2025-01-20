export const RSC_HEADER = 'RSC' as const
export const ACTION_HEADER = 'Next-Action' as const
// TODO: Instead of sending the full router state, we only need to send the
// segment path. Saves bytes. Then we could also use this field for segment
// prefetches, which also need to specify a particular segment.
export const NEXT_ROUTER_STATE_TREE_HEADER = 'Next-Router-State-Tree' as const
export const NEXT_ROUTER_PREFETCH_HEADER = 'Next-Router-Prefetch' as const
// This contains the path to the segment being prefetched.
// TODO: If we change Next-Router-State-Tree to be a segment path, we can use
// that instead. Then Next-Router-Prefetch and Next-Router-Segment-Prefetch can
// be merged into a single enum.
export const NEXT_ROUTER_SEGMENT_PREFETCH_HEADER =
  'Next-Router-Segment-Prefetch' as const
export const NEXT_HMR_REFRESH_HEADER = 'Next-HMR-Refresh' as const
export const NEXT_URL = 'Next-Url' as const
export const RSC_CONTENT_TYPE_HEADER = 'text/x-component' as const

export const FLIGHT_HEADERS = [
  RSC_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_HMR_REFRESH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
] as const

export const NEXT_RSC_UNION_QUERY = '_rsc' as const

export const NEXT_ROUTER_STALE_TIME_HEADER = 'x-nextjs-stale-time' as const
export const NEXT_DID_POSTPONE_HEADER = 'x-nextjs-postponed' as const
export const NEXT_REWRITTEN_PATH_HEADER = 'x-nextjs-rewritten-path' as const
export const NEXT_REWRITTEN_QUERY_HEADER = 'x-nextjs-rewritten-query' as const
export const NEXT_IS_PRERENDER_HEADER = 'x-nextjs-prerender' as const
