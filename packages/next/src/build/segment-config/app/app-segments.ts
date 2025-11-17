import type { Params } from '../../../server/request/params'
import type { AppPageRouteModule } from '../../../server/route-modules/app-page/module.compiled'
import type { AppRouteRouteModule } from '../../../server/route-modules/app-route/module.compiled'
import {
  type AppSegmentConfig,
  parseAppSegmentConfig,
} from './app-segment-config'

import { InvariantError } from '../../../shared/lib/invariant-error'
import {
  isAppRouteRouteModule,
  isAppPageRouteModule,
} from '../../../server/route-modules/checks'
import { isClientReference } from '../../../lib/client-and-server-references'
import { getSegmentParam } from '../../../shared/lib/router/utils/get-segment-param'
import {
  getLayoutOrPageModule,
  type LoaderTree,
} from '../../../server/lib/app-dir-module'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import type { FallbackRouteParam } from '../../static-paths/types'
import { createFallbackRouteParam } from '../../static-paths/utils'
import type { DynamicParamTypes } from '../../../shared/lib/app-router-types'

type GenerateStaticParams = (options: { params?: Params }) => Promise<Params[]>

/**
 * Parses the app config and attaches it to the segment.
 */
function attach(segment: AppSegment, userland: unknown, route: string) {
  // If the userland is not an object, then we can't do anything with it.
  if (typeof userland !== 'object' || userland === null) {
    return
  }

  // Try to parse the application configuration.
  const config = parseAppSegmentConfig(userland, route)

  // If there was any keys on the config, then attach it to the segment.
  if (Object.keys(config).length > 0) {
    segment.config = config
  }

  if (
    'generateStaticParams' in userland &&
    typeof userland.generateStaticParams === 'function'
  ) {
    segment.generateStaticParams =
      userland.generateStaticParams as GenerateStaticParams

    // Validate that `generateStaticParams` makes sense in this context.
    if (segment.config?.runtime === 'edge') {
      throw new Error(
        'Edge runtime is not supported with `generateStaticParams`.'
      )
    }
  }
}

export type AppSegment = {
  name: string
  paramName: string | undefined
  paramType: DynamicParamTypes | undefined
  filePath: string | undefined
  config: AppSegmentConfig | undefined
  isDynamicSegment: boolean
  generateStaticParams: GenerateStaticParams | undefined

  /**
   * Whether this segment is a parallel route segment or descends from a
   * parallel route segment.
   */
  isParallelRouteSegment: boolean | undefined
}

/**
 * Walks the loader tree and collects the generate parameters for each segment.
 *
 * @param routeModule the app page route module
 * @returns the segments for the app page route module
 */
async function collectAppPageSegments(routeModule: AppPageRouteModule) {
  // We keep track of unique segments, since with parallel routes, it's possible
  // to see the same segment multiple times.
  const uniqueSegments = new Map<string, AppSegment>()

  // Queue will store tuples of [loaderTree, currentSegments, isParallelRouteSegment]
  type QueueItem = [
    loaderTree: LoaderTree,
    currentSegments: AppSegment[],
    isParallelRouteSegment: boolean,
  ]
  const queue: QueueItem[] = [[routeModule.userland.loaderTree, [], false]]

  while (queue.length > 0) {
    const [loaderTree, currentSegments, isParallelRouteSegment] = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    // Process current node
    const { mod: userland, filePath } = await getLayoutOrPageModule(loaderTree)
    const isClientComponent = userland && isClientReference(userland)

    const { param: paramName, type: paramType } = getSegmentParam(name) ?? {}

    const segment: AppSegment = {
      name,
      paramName,
      paramType,
      filePath,
      config: undefined,
      isDynamicSegment: !!paramName,
      generateStaticParams: undefined,
      isParallelRouteSegment,
    }

    // Only server components can have app segment configurations
    if (!isClientComponent) {
      attach(segment, userland, routeModule.definition.pathname)
    }

    // Create a unique key for the segment
    const segmentKey = getSegmentKey(segment)
    if (!uniqueSegments.has(segmentKey)) {
      uniqueSegments.set(segmentKey, segment)
    }

    const updatedSegments = [...currentSegments, segment]

    // If this is a page segment, we've reached a leaf node
    if (name === PAGE_SEGMENT_KEY) {
      // Add all segments in the current path, preferring non-parallel segments
      updatedSegments.forEach((seg) => {
        const key = getSegmentKey(seg)
        if (!uniqueSegments.has(key)) {
          uniqueSegments.set(key, seg)
        }
      })
    }

    // Add all parallel routes to the queue
    for (const parallelRouteKey in parallelRoutes) {
      const parallelRoute = parallelRoutes[parallelRouteKey]
      queue.push([
        parallelRoute,
        updatedSegments,
        // A parallel route segment is one that descends from a segment that is
        // not children or descends from a parallel route segment.
        isParallelRouteSegment || parallelRouteKey !== 'children',
      ])
    }
  }

  return Array.from(uniqueSegments.values())
}

function getSegmentKey(segment: AppSegment) {
  return `${segment.name}-${segment.filePath ?? ''}-${segment.paramName ?? ''}-${segment.isParallelRouteSegment ? 'pr' : 'np'}`
}

/**
 * Collects the segments for a given app route module.
 *
 * @param routeModule the app route module
 * @returns the segments for the app route module
 */
function collectAppRouteSegments(
  routeModule: AppRouteRouteModule
): AppSegment[] {
  // Get the pathname parts, slice off the first element (which is empty).
  const parts = routeModule.definition.pathname.split('/').slice(1)
  if (parts.length === 0) {
    throw new InvariantError('Expected at least one segment')
  }

  // Generate all the segments.
  const segments: AppSegment[] = parts.map((name) => {
    const { param: paramName, type: paramType } = getSegmentParam(name) ?? {}

    return {
      name,
      paramName,
      paramType,
      filePath: undefined,
      isDynamicSegment: !!paramName,
      config: undefined,
      generateStaticParams: undefined,
      isParallelRouteSegment: undefined,
    } satisfies AppSegment
  })

  // We know we have at least one, we verified this above. We should get the
  // last segment which represents the root route module.
  const segment = segments[segments.length - 1]

  segment.filePath = routeModule.definition.filename

  // Extract the segment config from the userland module.
  attach(segment, routeModule.userland, routeModule.definition.pathname)

  return segments
}

/**
 * Collects the segments for a given route module.
 *
 * @param components the loaded components
 * @returns the segments for the route module
 */
export function collectSegments(
  routeModule: AppRouteRouteModule | AppPageRouteModule
): Promise<AppSegment[]> | AppSegment[] {
  if (isAppRouteRouteModule(routeModule)) {
    return collectAppRouteSegments(routeModule)
  }

  if (isAppPageRouteModule(routeModule)) {
    return collectAppPageSegments(routeModule)
  }

  throw new InvariantError(
    'Expected a route module to be one of app route or page'
  )
}

/**
 * Collects the fallback route params for a given app page route module. This is
 * a variant of the `collectSegments` function that only collects the fallback
 * route params without importing anything.
 *
 * @param routeModule the app page route module
 * @returns the fallback route params for the app page route module
 */
export function collectFallbackRouteParams(
  routeModule: AppPageRouteModule
): readonly FallbackRouteParam[] {
  const uniqueSegments = new Map<string, FallbackRouteParam>()

  // Queue will store tuples of [loaderTree, isParallelRouteSegment]
  type QueueItem = [loaderTree: LoaderTree, isParallelRouteSegment: boolean]
  const queue: QueueItem[] = [[routeModule.userland.loaderTree, false]]

  while (queue.length > 0) {
    const [loaderTree, isParallelRouteSegment] = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    // Handle this segment (if it's a dynamic segment param).
    const segmentParam = getSegmentParam(name)
    if (segmentParam) {
      const key = `${name}-${segmentParam.param}-${isParallelRouteSegment ? 'pr' : 'np'}`
      if (!uniqueSegments.has(key)) {
        uniqueSegments.set(
          key,
          createFallbackRouteParam(
            segmentParam.param,
            segmentParam.type,
            isParallelRouteSegment
          )
        )
      }
    }

    // Add all of this segment's parallel routes to the queue.
    for (const parallelRouteKey in parallelRoutes) {
      const parallelRoute = parallelRoutes[parallelRouteKey]
      queue.push([
        parallelRoute,
        // A parallel route segment is one that descends from a segment that is
        // not children or descends from a parallel route segment.
        isParallelRouteSegment || parallelRouteKey !== 'children',
      ])
    }
  }

  return Array.from(uniqueSegments.values())
}
