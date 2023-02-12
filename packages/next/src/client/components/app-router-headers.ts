export const RSC = 'RSC' as const
export const ACTION = 'Action' as const

export const NEXT_ROUTER_STATE_TREE = 'Next-Router-State-Tree' as const
export const NEXT_ROUTER_PREFETCH = 'Next-Router-Prefetch' as const
export const FETCH_CACHE_HEADER = 'x-vercel-sc-headers' as const
export const RSC_CONTENT_TYPE_HEADER = 'text/x-component' as const
export const RSC_VARY_HEADER =
  `${RSC}, ${NEXT_ROUTER_STATE_TREE}, ${NEXT_ROUTER_PREFETCH}` as const

export const FLIGHT_PARAMETERS = [
  [RSC],
  [NEXT_ROUTER_STATE_TREE],
  [NEXT_ROUTER_PREFETCH],
] as const
