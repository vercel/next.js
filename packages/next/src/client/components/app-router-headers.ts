export const RSC_HEADER = 'RSC' as const
export const ACTION_HEADER = 'Next-Action' as const
export const NEXT_ROUTER_STATE_TREE_HEADER = 'Next-Router-State-Tree' as const
export const NEXT_ROUTER_PREFETCH_HEADER = 'Next-Router-Prefetch' as const
export const NEXT_HMR_REFRESH_HEADER = 'Next-HMR-Refresh' as const
export const NEXT_URL = 'Next-Url' as const
export const RSC_CONTENT_TYPE_HEADER = 'text/x-component' as const

export const FLIGHT_HEADERS = [
  RSC_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_HMR_REFRESH_HEADER,
] as const

export const NEXT_RSC_UNION_QUERY = '_rsc' as const

export const NEXT_DID_POSTPONE_HEADER = 'x-nextjs-postponed' as const
export const NEXT_IS_PRERENDER_HEADER = 'x-nextjs-prerender' as const
