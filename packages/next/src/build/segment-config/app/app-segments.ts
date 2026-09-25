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
import type { VariantAssignment } from '../../../server/request/variants'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'

type GenerateStaticParams = (options: { params?: Params }) => Promise<Params[]>

/**
 * Declares the static variant combinations of a route.
 *
 * It takes no arguments. Each combination it returns applies to every prerender
 * of the route: to each combination of static params, and to each fallback
 * shell. A fallback shell is prerendered where a param is not known, so a
 * combination that depended on params could not apply to one.
 */
type GenerateStaticVariants = () =>
  | Promise<readonly VariantAssignment[][]>
  | readonly VariantAssignment[][]

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

  if (
    'unstable_generateStaticVariants' in userland &&
    typeof userland.unstable_generateStaticVariants === 'function'
  ) {
    segment.unstable_generateStaticVariants =
      userland.unstable_generateStaticVariants as GenerateStaticVariants
  }
}

export type AppSegment = {
  name: string
  paramName: string | undefined
  paramType: DynamicParamTypes | undefined
  filePath: string | undefined
  config: AppSegmentConfig | undefined
  generateStaticParams: GenerateStaticParams | undefined
  unstable_generateStaticVariants: GenerateStaticVariants | undefined
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
  const queue: LoaderTree[] = [routeModule.userland.loaderTree]

  while (queue.length > 0) {
    const loaderTree = queue.shift()!
    const [name, parallelRoutes] = loaderTree

    // Process current node
    const { mod: userland, filePath } = await getLayoutOrPageModule(loaderTree)
    const isClientComponent = userland && isClientReference(userland)

    const param = getSegmentParam(name)

    const segment: AppSegment = {
      name,
      paramName: param?.paramName,
      paramType: param?.paramType,
      filePath,
      config: undefined,
      generateStaticParams: undefined,
      unstable_generateStaticVariants: undefined,
    }

    // Only server components can have app segment configurations
    if (!isClientComponent) {
      attach(segment, userland, routeModule.definition.pathname)
    }

    // The build rejects combinations declared anywhere but on the page of a
    // route. Prerenders are produced per page, so combinations on a layout
    // would multiply those of every page beneath it. A default page does not
    // render the route, so it may not declare them either.
    //
    // Only the page carries this segment key, so the comparison finds it
    // whatever the shape of the tree, and a parallel route is never mistaken
    // for it.
    if (segment.unstable_generateStaticVariants && name !== PAGE_SEGMENT_KEY) {
      // A module that has exports has a file path. The segment name stands in
      // for it otherwise.
      const declaredIn = filePath ?? name

      throw new Error(
        `${declaredIn} exported \`unstable_generateStaticVariants\`, but only a page may declare variant combinations.`
      )
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
    for (const parallelRoute of Object.values(parallelRoutes)) {
      queue.push(parallelRoute)
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
      config: undefined,
      generateStaticParams: undefined,
      unstable_generateStaticVariants: undefined,
    } satisfies AppSegment
  })

  // We know we have at least one, we verified this above. We should get the
  // last segment which represents the root route module.
  const segment = segments[segments.length - 1]

  segment.filePath = routeModule.definition.filename

  // Extract the segment config from the userland module.
  attach(segment, routeModule.userland, routeModule.definition.pathname)

  // The build rejects combinations declared on a route handler. A route handler
  // cannot read a variant yet, so its response cannot differ between
  // combinations.
  //
  // TODO(variants): support variants in a route handler.
  if (segment.unstable_generateStaticVariants) {
    throw new Error(
      `${routeModule.definition.pathname} exported \`unstable_generateStaticVariants\`, but variants in a route handler are not supported yet.`
    )
  }

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
