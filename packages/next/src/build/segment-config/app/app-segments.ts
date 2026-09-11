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
import { isPlainObject } from '../../../shared/lib/is-plain-object'

type GenerateStaticParams = (options: { params?: Params }) => Promise<Params[]>

export const PRERENDER_PARAM_MODES = [
  'not-found',
  'blocking',
  'fallback',
  'dynamic',
] as const

export type PrerenderParamMode = (typeof PRERENDER_PARAM_MODES)[number]

export type PrerenderMatcher = Record<string, PrerenderParamMode>

function validateMatcherExport(
  route: string,
  filePath: string | undefined,
  exportName: string,
  value: unknown,
  visibleParamNames: readonly string[]
): PrerenderMatcher {
  if (!isPlainObject(value)) {
    const valueType =
      value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    throw new Error(
      `Invalid value from \`${exportName}\` for "${route}". Expected an object, but received ${valueType}.`
    )
  }

  const matcher: PrerenderMatcher = {}
  for (const [paramName, mode] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!visibleParamNames.includes(paramName)) {
      throw new Error(
        `Invalid parameter "${paramName}" in \`${exportName}\` for "${route}". The export in "${filePath}" may only configure parameters defined at or above its segment.`
      )
    }
    if (!PRERENDER_PARAM_MODES.includes(mode as PrerenderParamMode)) {
      throw new Error(
        `Invalid mode for parameter "${paramName}" in \`${exportName}\` for "${route}". Expected "not-found", "blocking", "fallback", or "dynamic", but received ${JSON.stringify(mode)}.`
      )
    }
    matcher[paramName] = mode as PrerenderParamMode
  }

  return matcher
}

/**
 * Parses the app config and attaches it to the segment.
 */
function attach(
  segment: AppSegment,
  userland: unknown,
  route: string,
  visibleParamNames: readonly string[]
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

  const hasStaticMatcher = 'experimental_paramMatching' in userland
  const hasGeneratedMatcher = 'experimental_generateParamMatching' in userland

  if (hasStaticMatcher || hasGeneratedMatcher) {
    if (hasStaticMatcher && hasGeneratedMatcher) {
      throw new Error(
        `Route "${route}" cannot export both \`experimental_paramMatching\` and \`experimental_generateParamMatching\`.`
      )
    }

    if (hasStaticMatcher) {
      segment.prerenderMatcher = validateMatcherExport(
        route,
        segment.filePath,
        'experimental_paramMatching',
        userland.experimental_paramMatching,
        visibleParamNames
      )
    } else {
      const generate = userland.experimental_generateParamMatching
      if (typeof generate !== 'function') {
        throw new Error(
          `Route "${route}" must export \`experimental_generateParamMatching\` as a function.`
        )
      }
      const { filePath } = segment
      // Retain the module's scope without evaluating user code until static
      // path generation has established its work store and cache context.
      segment.prerenderMatcher = async () =>
        validateMatcherExport(
          route,
          filePath,
          'experimental_generateParamMatching',
          await generate(),
          visibleParamNames
        )
    }
  }
}

export type AppSegment = {
  name: string
  // A deduplicated module can occur in more than one parallel branch.
  treePaths: string[][]
  paramName: string | undefined
  paramType: DynamicParamTypes | undefined
  filePath: string | undefined
  config: AppSegmentConfig | undefined
  prerenderMatcher:
    | PrerenderMatcher
    | (() => Promise<PrerenderMatcher>)
    | undefined
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
    visibleParamNames: string[]
    treePath: string[]
  }> = [
    {
      loaderTree: routeModule.userland.loaderTree,
      visibleParamNames: [],
      treePath: [],
    },
  ]

  while (queue.length > 0) {
    const { loaderTree, visibleParamNames, treePath } = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    // Process current node
    const { mod: userland, filePath } = await getLayoutOrPageModule(loaderTree)
    const isClientComponent = userland && isClientReference(userland)

    const param = getSegmentParam(name)
    const currentVisibleParamNames = param
      ? [...visibleParamNames, param.paramName]
      : visibleParamNames

    const segment: AppSegment = {
      name,
      treePaths: [treePath],
      paramName: param?.paramName,
      paramType: param?.paramType,
      filePath,
      config: undefined,
      prerenderMatcher: undefined,
      generateStaticParams: undefined,
    }

    // Only server components can have app segment configurations
    if (!isClientComponent) {
      attach(
        segment,
        userland,
        routeModule.definition.pathname,
        currentVisibleParamNames
      )
    }

    // If this segment doesn't already exist, then add it to the segments array.
    // The list of segments is short so we just use a list traversal to check
    // for duplicates and spare us needing to maintain the string key.
    const existingSegment = segments.find(
      (s) =>
        s.name === segment.name &&
        s.paramName === segment.paramName &&
        s.paramType === segment.paramType &&
        s.filePath === segment.filePath
    )
    if (existingSegment) {
      existingSegment.treePaths.push(treePath)
    } else {
      segments.push(segment)
    }

    // Add all parallel routes to the queue
    for (const [parallelRouteKey, parallelRoute] of Object.entries(
      parallelRoutes
    )) {
      queue.push({
        loaderTree: parallelRoute,
        visibleParamNames: currentVisibleParamNames,
        treePath: [...treePath, parallelRouteKey],
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
  const segments: AppSegment[] = parts.map((name, index) => {
    const param = getSegmentParam(name)

    return {
      name,
      treePaths: [parts.slice(0, index)],
      paramName: param?.paramName,
      paramType: param?.paramType,
      filePath: undefined,
      config: undefined,
      prerenderMatcher: undefined,
      generateStaticParams: undefined,
    } satisfies AppSegment
  })

  // We know we have at least one, we verified this above. We should get the
  // last segment which represents the root route module.
  const segment = segments[segments.length - 1]

  segment.filePath = routeModule.definition.filename

  // Extract the segment config from the userland module.
  attach(segment, routeModule.userland, routeModule.definition.pathname, [])

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
