import type { LoadComponentsReturnType } from '../../../server/load-components'
import type { Params } from '../../../server/request/params'
import type {
  AppPageRouteModule,
  AppPageModule,
} from '../../../server/route-modules/app-page/module.compiled'
import type {
  AppRouteRouteModule,
  AppRouteModule,
} from '../../../server/route-modules/app-route/module.compiled'
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
import { getSegmentParam } from '../../../server/app-render/get-segment-param'
import {
  getLayoutOrPageModule,
  type LoaderTree,
} from '../../../server/lib/app-dir-module'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

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
  param: string | undefined
  filePath: string | undefined
  config: AppSegmentConfig | undefined
  isDynamicSegment: boolean
  generateStaticParams: GenerateStaticParams | undefined
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

  // Queue will store tuples of [loaderTree, currentSegments]
  type QueueItem = [LoaderTree, AppSegment[]]
  const queue: QueueItem[] = [[routeModule.userland.loaderTree, []]]

  while (queue.length > 0) {
    const [loaderTree, currentSegments] = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    // Process current node
    const { mod: userland, filePath } = await getLayoutOrPageModule(loaderTree)
    const isClientComponent = userland && isClientReference(userland)

    const param = getSegmentParam(name)?.param

    const segment: AppSegment = {
      name,
      param,
      filePath,
      config: undefined,
      isDynamicSegment: !!param,
      generateStaticParams: undefined,
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
      // Add all segments in the current path
      updatedSegments.forEach((seg) => {
        const key = getSegmentKey(seg)
        uniqueSegments.set(key, seg)
      })
    }

    // Add all parallel routes to the queue
    for (const parallelRouteKey in parallelRoutes) {
      const parallelRoute = parallelRoutes[parallelRouteKey]
      queue.push([parallelRoute, updatedSegments])
    }
  }

  return Array.from(uniqueSegments.values())
}

function getSegmentKey(segment: AppSegment) {
  return `${segment.name}-${segment.filePath ?? ''}-${segment.param ?? ''}`
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
    const param = getSegmentParam(name)?.param

    return {
      name,
      param,
      filePath: undefined,
      isDynamicSegment: !!param,
      config: undefined,
      generateStaticParams: undefined,
    }
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
export function collectSegments({
  routeModule,
}: LoadComponentsReturnType<AppPageModule | AppRouteModule>):
  | Promise<AppSegment[]>
  | AppSegment[] {
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
