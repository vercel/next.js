import { LoaderTree } from '../lib/app-dir-module'
import { FlightRouterState } from './types'
import { GetDynamicParamFromSegment } from './app-render'
import { stringify } from 'querystring'

export function createFlightRouterStateFromLoaderTree(
  [segment, parallelRoutes, { layout }]: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  searchParams: any,
  rootLayoutIncluded = false
): FlightRouterState {
  const dynamicParam = getDynamicParamFromSegment(segment)

  const treeSegment = dynamicParam ? dynamicParam.treeSegment : segment
  const isPageSegment = segment === '__PAGE__'
  const stringifiedQuery = stringify(searchParams)

  const segmentTree: FlightRouterState = [
    treeSegment +
      (isPageSegment && stringifiedQuery !== '' ? '?' + stringifiedQuery : ''),
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
