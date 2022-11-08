import {
  DynamicParamTypesShort,
  FlightRouterState,
} from '../../server/app-render'

export const RSC = 'RSC' as const
export const NEXT_ROUTER_STATE_TREE = 'Next-Router-State-Tree' as const
export const NEXT_ROUTER_PREFETCH = 'Next-Router-Prefetch' as const
export const RSC_VARY_HEADER =
  `${RSC}, ${NEXT_ROUTER_STATE_TREE}, ${NEXT_ROUTER_PREFETCH}` as const

export const escapeFlightRouterState = (
  state: FlightRouterState
): FlightRouterState => {
  const [segment, parallelRoutes, ...restState] = state
  const escapedParallelRoutes: typeof parallelRoutes = Object.create({})
  let escapedSegment: typeof segment = segment

  if (typeof segment !== 'string') {
    const [param, value, type] = segment
    const escapedSegmentValue = encodeURIComponent(value)
    escapedSegment = [
      param,
      escapedSegmentValue,
      type as DynamicParamTypesShort,
    ]
  }

  Object.keys(parallelRoutes).forEach((key) => {
    const childState = parallelRoutes[key]

    escapedParallelRoutes[key] = escapeFlightRouterState(childState)
  })

  return [escapedSegment, escapedParallelRoutes, ...restState]
}
