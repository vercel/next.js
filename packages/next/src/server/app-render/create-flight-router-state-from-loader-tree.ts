import type { LoaderTree } from '../lib/app-dir-module'
import type { FlightRouterState } from './types'
import type { GetDynamicParamFromSegment } from './app-render'
import { addSearchParamsIfPageSegment } from '../../shared/lib/segment'

export function createFlightRouterStateFromLoaderTree(
  [segment, parallelRoutes, { layout }]: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  rootLayoutIncluded = false
): FlightRouterState {
  const dynamicParam = getDynamicParamFromSegment(segment)
  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment

  const segmentTree: FlightRouterState = [
    addSearchParamsIfPageSegment(treeSegment, searchParams),
    {},
  ]

  if (!rootLayoutIncluded && typeof layout !== 'undefined') {
    rootLayoutIncluded = true
    segmentTree[4] = true
  }

  segmentTree[1] = Object.keys(parallelRoutes).reduce(
    (existingValue, currentValue) => {
      existingValue[currentValue] = createFlightRouterStateFromLoaderTree(
        parallelRoutes[currentValue],
        getDynamicParamFromSegment,
        searchParams,
        rootLayoutIncluded
      )
      return existingValue
    },
    {} as FlightRouterState[1]
  )

  return segmentTree
}
