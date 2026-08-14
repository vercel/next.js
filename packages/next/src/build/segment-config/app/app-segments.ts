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
import type { DynamicParamTypes } from '../../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
  isGroupSegment,
} from '../../../shared/lib/segment'

type GenerateStaticParams = (options: { params?: Params }) => Promise<Params[]>

export type PrerenderParamMode =
  | 'not-found'
  | 'blocking'
  | 'fallback'
  | 'dynamic'

export type PrerenderMatcher = Record<string, PrerenderParamMode>

type GeneratePrerenderMatcher = () => unknown | Promise<unknown>

export type PrerenderMatcherExport =
  | {
      readonly kind: 'static'
      readonly value: unknown
    }
  | {
      readonly kind: 'generated'
      readonly generate: GeneratePrerenderMatcher
    }

/**
 * Parses the app config and attaches it to the segment.
 */
function attach(
  segment: AppSegment,
  userland: unknown,
  route: string,
  moduleType: 'layout' | 'page' | 'route' | undefined
) {
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

    // Compiler-injected factory whose error stack is anchored at the user's
    // `generateStaticParams` declaration. Used to throw a meaningful error when
    // an empty result is detected under Cache Components.
    const createEmptyParamsError = (userland as Record<string, unknown>)
      .__next_create_empty_gsp_error
    if (typeof createEmptyParamsError === 'function') {
      segment.createEmptyParamsError = createEmptyParamsError as () => Error
    }

    // Validate that `generateStaticParams` makes sense in this context.
    if (segment.config?.runtime === 'edge') {
      throw new Error(
        'Edge runtime is not supported with `generateStaticParams`.'
      )
    }
  }

  const hasStaticMatcher = 'unstable_matcher' in userland
  const hasGeneratedMatcher = 'unstable_generateMatcher' in userland

  if (hasStaticMatcher || hasGeneratedMatcher) {
    if (moduleType === 'route') {
      throw new Error(
        'Unstable prerender matchers are only supported in layouts and pages.'
      )
    }

    if (hasStaticMatcher && hasGeneratedMatcher) {
      throw new Error(
        `Route "${route}" cannot export both \`unstable_matcher\` and \`unstable_generateMatcher\`.`
      )
    }

    if (hasStaticMatcher) {
      segment.prerenderMatcher = {
        kind: 'static',
        value: userland.unstable_matcher,
      }
    } else {
      if (typeof userland.unstable_generateMatcher !== 'function') {
        throw new Error(
          `Route "${route}" must export \`unstable_generateMatcher\` as a function.`
        )
      }
      segment.prerenderMatcher = {
        kind: 'generated',
        generate: userland.unstable_generateMatcher as GeneratePrerenderMatcher,
      }
    }

    if (segment.config?.runtime === 'edge') {
      throw new Error(
        'Edge runtime is not supported with unstable prerender matchers.'
      )
    }
  }
}

export type AppSegment = {
  name: string
  paramName: string | undefined
  paramType: DynamicParamTypes | undefined
  filePath: string | undefined
  moduleType: 'layout' | 'page' | 'route' | undefined
  pathMatcher: string
  treePath: readonly string[]
  config: AppSegmentConfig | undefined
  prerenderMatcher: PrerenderMatcherExport | undefined
  generateStaticParams: GenerateStaticParams | undefined
  createEmptyParamsError?: () => Error
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
  const segments: AppSegment[] = []

  // Queue will store loader trees.
  const queue: Array<{
    loaderTree: LoaderTree
    matcherSegments: string[]
    treePath: string[]
  }> = [
    {
      loaderTree: routeModule.userland.loaderTree,
      matcherSegments: [],
      treePath: [],
    },
  ]

  while (queue.length > 0) {
    const { loaderTree, matcherSegments, treePath } = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    const currentMatcherSegments = matcherSegments.slice()
    if (
      name &&
      name !== PAGE_SEGMENT_KEY &&
      name !== DEFAULT_SEGMENT_KEY &&
      !isGroupSegment(name)
    ) {
      currentMatcherSegments.push(name)
    }

    // Process current node
    const {
      mod: userland,
      modType: moduleType,
      filePath,
    } = await getLayoutOrPageModule(loaderTree)
    const isClientComponent = userland && isClientReference(userland)

    const param = getSegmentParam(name)

    const segment: AppSegment = {
      name,
      paramName: param?.paramName,
      paramType: param?.paramType,
      filePath,
      moduleType,
      pathMatcher: `/${currentMatcherSegments.join('/')}`,
      treePath,
      config: undefined,
      prerenderMatcher: undefined,
      generateStaticParams: undefined,
    }

    // Only server components can have app segment configurations
    if (!isClientComponent) {
      attach(segment, userland, routeModule.definition.pathname, moduleType)
    }

    // If this segment doesn't already exist, then add it to the segments array.
    // The list of segments is short so we just use a list traversal to check
    // for duplicates and spare us needing to maintain the string key.
    if (
      segments.every(
        (s) =>
          s.name !== segment.name ||
          s.paramName !== segment.paramName ||
          s.paramType !== segment.paramType ||
          s.filePath !== segment.filePath
      )
    ) {
      segments.push(segment)
    }

    // Add all parallel routes to the queue
    for (const [parallelRouteKey, parallelRoute] of Object.entries(
      parallelRoutes
    )) {
      queue.push({
        loaderTree: parallelRoute,
        matcherSegments: currentMatcherSegments,
        treePath: [
          ...treePath,
          `/${currentMatcherSegments.join('/')}@${parallelRouteKey}`,
        ],
      })
    }
  }

  return segments
}

/**
 * Collects the segments for a given app route module.
 *
 * @param routeModule the app route module
 * @returns the segments for the app route module
 */
async function collectAppRouteSegments(
  routeModule: AppRouteRouteModule
): Promise<AppSegment[]> {
  // The route file may be an async module (top-level await), so the userland
  // module must be resolved before its exports can be inspected.
  await routeModule.ensureUserland()

  // Get the pathname parts, slice off the first element (which is empty).
  const parts = routeModule.definition.pathname.split('/').slice(1)
  if (parts.length === 0) {
    throw new InvariantError('Expected at least one segment')
  }

  // Generate all the segments.
  const segments: AppSegment[] = parts.map((name) => {
    const param = getSegmentParam(name)

    return {
      name,
      paramName: param?.paramName,
      paramType: param?.paramType,
      filePath: undefined,
      moduleType: undefined,
      pathMatcher: routeModule.definition.pathname,
      treePath: [],
      config: undefined,
      prerenderMatcher: undefined,
      generateStaticParams: undefined,
    } satisfies AppSegment
  })

  // We know we have at least one, we verified this above. We should get the
  // last segment which represents the root route module.
  const segment = segments[segments.length - 1]

  segment.filePath = routeModule.definition.filename
  segment.moduleType = 'route'

  // Extract the segment config from the userland module.
  attach(
    segment,
    routeModule.userland,
    routeModule.definition.pathname,
    'route'
  )

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
