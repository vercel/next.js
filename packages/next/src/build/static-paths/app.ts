import type { Params } from '../../server/request/params'
import type { AppPageModule } from '../../server/route-modules/app-page/module'
import type { AppSegment } from '../segment-config/app/app-segments'
import type {
  FallbackRouteParam,
  PrerenderedRoute,
  StaticPathsResult,
} from './types'

import path from 'node:path'
import { AfterRunner } from '../../server/after/run-with-after'
import { createWorkStore } from '../../server/async-storage/work-store'
import { FallbackMode } from '../../lib/fallback'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import {
  normalizePathname,
  encodeParam,
  extractPathnameRouteParamSegments,
  resolveRouteParamsFromTree,
} from './utils'
import escapePathDelimiters from '../../shared/lib/router/utils/escape-path-delimiters'
import { createIncrementalCache } from '../../export/helpers/create-incremental-cache'
import type { NextConfigComplete } from '../../server/config-shared'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type { DynamicParamTypes } from '../../shared/lib/app-router-types'
import { getParamProperties } from '../../shared/lib/router/utils/get-segment-param'
import { throwEmptyGenerateStaticParamsError } from '../../shared/lib/errors/empty-generate-static-params-error'
import type { AppRouteModule } from '../../server/route-modules/app-route/module.compiled'
import type { NormalizedAppRoute } from '../../shared/lib/router/routes/app'
import { interceptionPrefixFromParamType } from '../../shared/lib/router/utils/interception-prefix-from-param-type'

/**
 * Filters out duplicate parameters from a list of parameters.
 * This function uses a Map to efficiently store and retrieve unique parameter combinations.
 *
 * @param childrenRouteParams - The keys of the parameters. These should be sorted to ensure consistent key generation.
 * @param routeParams - The list of parameter objects to filter.
 * @returns A new array containing only the unique parameter combinations.
 */
export function filterUniqueParams(
  childrenRouteParams: readonly { paramName: string }[],
  routeParams: readonly Params[]
): Params[] {
  // A Map is used to store unique parameter combinations. The key of the Map
  // is a string representation of the parameter combination, and the value
  // is the actual `Params` object.
  const unique = new Map<string, Params>()

  // Iterate over each parameter object in the input array.
  for (const params of routeParams) {
    let key = '' // Initialize an empty string to build the unique key for the current `params` object.

    // Iterate through the `routeParamKeys` (which are assumed to be sorted).
    // This consistent order is crucial for generating a stable and unique key
    // for each parameter combination.
    for (const { paramName: paramKey } of childrenRouteParams) {
      const value = params[paramKey]

      // Construct a part of the key using the parameter key and its value.
      // A type prefix (`A:` for Array, `S:` for String, `U:` for undefined) is added to the value
      // to prevent collisions. For example, `['a', 'b']` and `'a,b'` would
      // otherwise generate the same string representation, leading to incorrect
      // deduplication. This ensures that different types with the same string
      // representation are treated as distinct.
      let valuePart: string
      if (Array.isArray(value)) {
        valuePart = `A:${value.join(',')}`
      } else if (value === undefined) {
        valuePart = `U:undefined`
      } else {
        valuePart = `S:${value}`
      }
      key += `${paramKey}:${valuePart}|`
    }

    // If the generated key is not already in the `unique` Map, it means this
    // parameter combination is unique so far. Add it to the Map.
    if (!unique.has(key)) {
      unique.set(key, params)
    }
  }

  // Convert the Map's values (the unique `Params` objects) back into an array
  // and return it.
  return Array.from(unique.values())
}

/**
 * Generates all unique sub-combinations of Route Parameters from a list of Static Parameters.
 * This function creates all possible prefixes of the Route Parameters, which is
 * useful for generating Static Shells that can serve as Fallback Shells for more specific Route Shells.
 *
 * When Root Parameters are provided, the function ensures that Static Shells only
 * include complete sets of Root Parameters. This prevents generating invalid Static Shells
 * that are missing required Root Parameters.
 *
 * Example with Root Parameters ('lang', 'region') and Route Parameters ('lang', 'region', 'slug'):
 *
 * Given the following Static Parameters:
 * ```
 * [
 *   { lang: 'en', region: 'US', slug: ['home'] },
 *   { lang: 'en', region: 'US', slug: ['about'] },
 *   { lang: 'fr', region: 'CA', slug: ['about'] },
 * ]
 * ```
 *
 * The result will be:
 * ```
 * [
 *   { lang: 'en', region: 'US' },  // Complete Root Parameters
 *   { lang: 'en', region: 'US', slug: ['home'] },
 *   { lang: 'en', region: 'US', slug: ['about'] },
 *   { lang: 'fr', region: 'CA' },  // Complete Root Parameters
 *   { lang: 'fr', region: 'CA', slug: ['about'] },
 * ]
 * ```
 *
 * Note that partial combinations like `{ lang: 'en' }` are NOT generated because
 * they don't include the complete set of Root Parameters.
 *
 * For routes without Root Parameters (e.g., `/[slug]`), all sub-combinations are generated
 * as before.
 *
 * @param childrenRouteParams - The children route params. These should be sorted
 *   to ensure consistent key generation for the internal Map.
 * @param routeParams - The list of Static Parameters to filter.
 * @param rootParamKeys - The keys of the Root Parameters. When provided, ensures Static Shells
 *   include all Root Parameters.
 * @returns A new array containing all unique sub-combinations of Route Parameters.
 */
export function generateAllParamCombinations(
  childrenRouteParams: ReadonlyArray<{
    readonly paramName: string
  }>,
  routeParams: readonly Params[],
  rootParamKeys: readonly string[]
): Params[] {
  // A Map is used to store unique combinations of Route Parameters.
  // The key of the Map is a string representation of the Route Parameter
  // combination, and the value is the `Params` object containing only
  // the Route Parameters.
  const combinations = new Map<string, Params>()

  // Determine the minimum index where all Root Parameters are included.
  // This optimization ensures we only generate combinations that include
  // a complete set of Root Parameters, preventing invalid Static Shells.
  //
  // For example, if rootParamKeys = ['lang', 'region'] and routeParamKeys = ['lang', 'region', 'slug']:
  // - 'lang' is at index 0, 'region' is at index 1
  // - minIndexForCompleteRootParams = max(0, 1) = 1
  // - We'll only generate combinations starting from index 1 (which includes both lang and region)
  let minIndexForCompleteRootParams = -1
  if (rootParamKeys.length > 0) {
    // Find the index of the last Root Parameter in routeParamKeys.
    // This tells us the minimum combination length needed to include all Root Parameters.
    for (const rootParamKey of rootParamKeys) {
      const index = childrenRouteParams.findIndex(
        (param) => param.paramName === rootParamKey
      )
      if (index === -1) {
        // Root Parameter not found in Route Parameters - this shouldn't happen in normal cases
        // but we handle it gracefully by treating it as if there are no Root Parameters.
        // This allows the function to fall back to generating all sub-combinations.
        minIndexForCompleteRootParams = -1
        break
      }
      // Track the highest index among all Root Parameters.
      // This ensures all Root Parameters are included in any generated combination.
      minIndexForCompleteRootParams = Math.max(
        minIndexForCompleteRootParams,
        index
      )
    }
  }

  // Iterate over each Static Parameter object in the input array.
  // Each params object represents one potential route combination (e.g., { lang: 'en', region: 'US', slug: 'home' })
  for (const params of routeParams) {
    // Generate all possible prefix combinations for this Static Parameter set.
    // For routeParamKeys = ['lang', 'region', 'slug'], we'll generate combinations at:
    // - i=0: { lang: 'en' }
    // - i=1: { lang: 'en', region: 'US' }
    // - i=2: { lang: 'en', region: 'US', slug: 'home' }
    //
    // The iteration order is crucial for generating stable and unique keys
    // for each Route Parameter combination.
    for (let i = 0; i < childrenRouteParams.length; i++) {
      // Skip generating combinations that don't include all Root Parameters.
      // This prevents creating invalid Static Shells that are missing required Root Parameters.
      //
      // For example, if Root Parameters are ['lang', 'region'] and minIndexForCompleteRootParams = 1:
      // - Skip i=0 (would only include 'lang', missing 'region')
      // - Process i=1 and higher (includes both 'lang' and 'region')
      if (
        minIndexForCompleteRootParams >= 0 &&
        i < minIndexForCompleteRootParams
      ) {
        continue
      }

      // Initialize data structures for building this specific combination
      const combination: Params = {}
      const keyParts: string[] = []
      let hasAllRootParams = true

      // Build the sub-combination with parameters from index 0 to i (inclusive).
      // This creates a prefix of the full parameter set, building up combinations incrementally.
      //
      // For example, if routeParamKeys = ['lang', 'region', 'slug'] and i = 1:
      // - j=0: Add 'lang' parameter
      // - j=1: Add 'region' parameter
      // Result: { lang: 'en', region: 'US' }
      for (let j = 0; j <= i; j++) {
        const { paramName: routeKey } = childrenRouteParams[j]

        // Check if the parameter exists in the original params object and has a defined value.
        // This handles cases where generateStaticParams doesn't provide all possible parameters,
        // or where some parameters are optional/undefined.
        if (
          !params.hasOwnProperty(routeKey) ||
          params[routeKey] === undefined
        ) {
          // If this missing parameter is a Root Parameter, mark the combination as invalid.
          // Root Parameters are required for Static Shells, so we can't generate partial combinations without them.
          if (rootParamKeys.includes(routeKey)) {
            hasAllRootParams = false
          }
          // Stop building this combination since we've hit a missing parameter.
          // This ensures we only generate valid prefix combinations with consecutive parameters.
          break
        }

        const value = params[routeKey]
        combination[routeKey] = value

        // Construct a unique key part for this parameter to enable deduplication.
        // We use type prefixes to prevent collisions between different value types
        // that might have the same string representation.
        //
        // Examples:
        // - Array ['foo', 'bar'] becomes "A:foo,bar"
        // - String "foo,bar" becomes "S:foo,bar"
        // - This prevents collisions between ['foo', 'bar'] and "foo,bar"
        let valuePart: string
        if (Array.isArray(value)) {
          valuePart = `A:${value.join(',')}`
        } else {
          valuePart = `S:${value}`
        }
        keyParts.push(`${routeKey}:${valuePart}`)
      }

      // Build the final unique key by joining all parameter parts.
      // This key is used for deduplication in the combinations Map.
      // Format: "lang:S:en|region:S:US|slug:A:home,about"
      const currentKey = keyParts.join('|')

      // Only add the combination if it meets our criteria:
      // 1. hasAllRootParams: Contains all required Root Parameters
      // 2. !combinations.has(currentKey): Is not a duplicate of an existing combination
      //
      // This ensures we only generate valid, unique parameter combinations for Static Shells.
      if (hasAllRootParams && !combinations.has(currentKey)) {
        combinations.set(currentKey, combination)
      }
    }
  }

  // Convert the Map's values back into an array and return the final result.
  // The Map ensures all combinations are unique, and we return only the
  // parameter objects themselves, discarding the internal deduplication keys.
  return Array.from(combinations.values())
}

/**
 * Calculates the fallback mode based on the given parameters.
 *
 * @param dynamicParams - Whether dynamic params are enabled.
 * @param fallbackRootParams - The root params that are part of the fallback.
 * @param baseFallbackMode - The base fallback mode to use.
 * @returns The calculated fallback mode.
 */
export function calculateFallbackMode(
  dynamicParams: boolean,
  fallbackRootParams: readonly string[],
  baseFallbackMode: FallbackMode | undefined
): FallbackMode {
  return dynamicParams
    ? // If the fallback params includes any root params, then we need to
      // perform a blocking static render.
      fallbackRootParams.length > 0
      ? FallbackMode.BLOCKING_STATIC_RENDER
      : (baseFallbackMode ?? FallbackMode.NOT_FOUND)
    : FallbackMode.NOT_FOUND
}

/**
 * Validates the parameters to ensure they're accessible and have the correct
 * types.
 *
 * @param page - The page to validate.
 * @param regex - The route regex.
 * @param isRoutePPREnabled - Whether the route has partial prerendering enabled.
 * @param pathnameSegments - The keys of the parameters.
 * @param rootParamKeys - The keys of the root params.
 * @param routeParams - The list of parameters to validate.
 * @returns The list of validated parameters.
 */
function validateParams(
  page: string,
  isRoutePPREnabled: boolean,
  pathnameSegments: ReadonlyArray<{
    readonly paramName: string
    readonly paramType: DynamicParamTypes
  }>,
  rootParamKeys: readonly string[],
  routeParams: readonly Params[]
): Params[] {
  const valid: Params[] = []

  // Validate that if there are any root params, that the user has provided at
  // least one value for them only if we're using partial prerendering.
  if (isRoutePPREnabled && rootParamKeys.length > 0) {
    if (
      routeParams.length === 0 ||
      rootParamKeys.some((key) =>
        routeParams.some((params) => !(key in params))
      )
    ) {
      if (rootParamKeys.length === 1) {
        throw new Error(
          `A required root parameter (${rootParamKeys[0]}) was not provided in generateStaticParams for ${page}, please provide at least one value.`
        )
      }

      throw new Error(
        `Required root params (${rootParamKeys.join(', ')}) were not provided in generateStaticParams for ${page}, please provide at least one value for each.`
      )
    }
  }

  for (const params of routeParams) {
    const item: Params = {}

    for (const { paramName: key, paramType } of pathnameSegments) {
      const { repeat, optional } = getParamProperties(paramType)

      let paramValue = params[key]

      if (
        optional &&
        params.hasOwnProperty(key) &&
        (paramValue === null ||
          paramValue === undefined ||
          (paramValue as any) === false)
      ) {
        paramValue = []
      }

      // A parameter is missing, so the rest of the params are not accessible.
      // We only support this when the route has partial prerendering enabled.
      // This will make it so that the remaining params are marked as missing so
      // we can generate a fallback route for them.
      if (!paramValue && isRoutePPREnabled) {
        break
      }

      // Perform validation for the parameter based on whether it's a repeat
      // parameter or not.
      if (repeat) {
        if (!Array.isArray(paramValue)) {
          throw new Error(
            `A required parameter (${key}) was not provided as an array received ${typeof paramValue} in generateStaticParams for ${page}`
          )
        }
      } else {
        if (typeof paramValue !== 'string') {
          throw new Error(
            `A required parameter (${key}) was not provided as a string received ${typeof paramValue} in generateStaticParams for ${page}`
          )
        }
      }

      item[key] = paramValue
    }

    valid.push(item)
  }

  return valid
}

interface TrieNode {
  /**
   * The children of the node. Each key is a unique string representation of a parameter value,
   * and the value is the next TrieNode in the path.
   */
  children: Map<string, TrieNode>

  /**
   * The routes that are associated with this specific parameter combination (node).
   * These are the routes whose concrete parameters lead to this node in the Trie.
   */
  routes: PrerenderedRoute[]
}

/**
 * Assigns the throwOnEmptyStaticShell property to each of the prerendered routes.
 * This function uses a Trie data structure to efficiently determine whether each route
 * should throw an error when its static shell is empty.
 *
 * A route should not throw on empty static shell if it has child routes in the Trie. For example,
 * if we have two routes, `/blog/first-post` and `/blog/[slug]`, the route for
 * `/blog/[slug]` should not throw because `/blog/first-post` is a more specific concrete route.
 *
 * @param prerenderedRoutes - The prerendered routes.
 * @param pathnameSegments - The keys of the route parameters.
 */
export function assignErrorIfEmpty(
  prerenderedRoutes: readonly PrerenderedRoute[],
  pathnameSegments: ReadonlyArray<{
    readonly paramName: string
  }>
): void {
  // If there are no routes to process, exit early.
  if (prerenderedRoutes.length === 0) {
    return
  }

  // Initialize the root of the Trie. This node represents the starting point
  // before any parameters have been considered.
  const root: TrieNode = { children: new Map(), routes: [] }

  // Phase 1: Build the Trie.
  // Iterate over each prerendered route and insert it into the Trie.
  // Each route's concrete parameter values form a path in the Trie.
  for (const route of prerenderedRoutes) {
    let currentNode = root // Start building the path from the root for each route.

    // Iterate through the sorted parameter keys. The order of keys is crucial
    // for ensuring that routes with the same concrete parameters follow the
    // same path in the Trie, regardless of the original order of properties
    // in the `params` object.
    for (const { paramName: key } of pathnameSegments) {
      // Check if the current route actually has a concrete value for this parameter.
      // If a dynamic segment is not filled (i.e., it's a fallback), it won't have
      // this property, and we stop building the path for this route at this point.
      if (route.params.hasOwnProperty(key)) {
        const value = route.params[key]

        // Generate a unique key for the parameter's value. This is critical
        // to prevent collisions between different data types that might have
        // the same string representation (e.g., `['a', 'b']` vs `'a,b'`).
        // A type prefix (`A:` for Array, `S:` for String, `U:` for undefined)
        // is added to the value to prevent collisions. This ensures that
        // different types with the same string representation are treated as
        // distinct.
        let valueKey: string
        if (Array.isArray(value)) {
          valueKey = `A:${value.join(',')}`
        } else if (value === undefined) {
          valueKey = `U:undefined`
        } else {
          valueKey = `S:${value}`
        }

        // Look for a child node corresponding to this `valueKey` from the `currentNode`.
        let childNode = currentNode.children.get(valueKey)
        if (!childNode) {
          // If the child node doesn't exist, create a new one and add it to
          // the current node's children.
          childNode = { children: new Map(), routes: [] }
          currentNode.children.set(valueKey, childNode)
        }
        // Move deeper into the Trie to the `childNode` for the next parameter.
        currentNode = childNode
      }
    }
    // After processing all concrete parameters for the route, add the full
    // `PrerenderedRoute` object to the `routes` array of the `currentNode`.
    // This node represents the unique concrete parameter combination for this route.
    currentNode.routes.push(route)
  }

  // Phase 2: Traverse the Trie to assign the `throwOnEmptyStaticShell` property.
  // This is done using an iterative Depth-First Search (DFS) approach with an
  // explicit stack to avoid JavaScript's recursion depth limits (stack overflow)
  // for very deep routing structures.
  const stack: TrieNode[] = [root] // Initialize the stack with the root node.

  while (stack.length > 0) {
    const node = stack.pop()! // Pop the next node to process from the stack.

    // `hasChildren` indicates if this node has any more specific concrete
    // parameter combinations branching off from it. If true, it means this
    // node represents a prefix for other, more specific routes.
    const hasChildren = node.children.size > 0

    // If the current node has routes associated with it (meaning, routes whose
    // concrete parameters lead to this node's path in the Trie).
    if (node.routes.length > 0) {
      // Determine the minimum number of fallback parameters among all routes
      // that are associated with this current Trie node. This is used to
      // identify if a route should not throw on empty static shell relative to another route *at the same level*
      // of concrete parameters, but with fewer fallback parameters.
      let minFallbacks = Infinity
      for (const r of node.routes) {
        // `fallbackRouteParams?.length ?? 0` handles cases where `fallbackRouteParams`
        // might be `undefined` or `null`, treating them as 0 length.
        minFallbacks = Math.min(
          minFallbacks,
          r.fallbackRouteParams ? r.fallbackRouteParams.length : 0
        )
      }

      // Now, for each `PrerenderedRoute` associated with this node:
      for (const route of node.routes) {
        // A route is ok not to throw on an empty static shell (and thus
        // `throwOnEmptyStaticShell` should be `false`) if either of the
        // following conditions is met:
        // 1. `hasChildren` is true: This node has further concrete parameter children.
        //    This means the current route is a parent to more specific routes (e.g.,
        //    `/blog/[slug]` should not throw when concrete routes like `/blog/first-post` exist).
        // OR
        // 2. `route.fallbackRouteParams.length > minFallbacks`: This route has
        //    more fallback parameters than another route at the same Trie node.
        //    This implies the current route is a more general version that should not throw
        //    compared to a more specific route that has fewer fallback parameters
        //    (e.g., `/1234/[...slug]` should not throw relative to `/[id]/[...slug]`).
        if (
          hasChildren ||
          (route.fallbackRouteParams &&
            route.fallbackRouteParams.length > minFallbacks)
        ) {
          route.throwOnEmptyStaticShell = false // Should not throw on empty static shell.
        } else {
          route.throwOnEmptyStaticShell = true // Should throw on empty static shell.
        }
      }
    }

    // Add all children of the current node to the stack. This ensures that
    // the traversal continues to explore deeper paths in the Trie.
    for (const child of node.children.values()) {
      stack.push(child)
    }
  }
}

/**
 * Processes app directory segments to build route parameters from generateStaticParams functions.
 * This function walks through the segments array and calls generateStaticParams for each segment that has it,
 * combining parent parameters with child parameters to build the complete parameter combinations.
 * Uses iterative processing instead of recursion for better performance.
 *
 * @param segments - Array of app directory segments to process
 * @param store - Work store for tracking fetch cache configuration
 * @returns Promise that resolves to an array of all parameter combinations
 */
export async function generateRouteStaticParams(
  segments: ReadonlyArray<
    Readonly<Pick<AppSegment, 'config' | 'generateStaticParams'>>
  >,
  store: Pick<WorkStore, 'fetchCache'>,
  isRoutePPREnabled: boolean
): Promise<Params[]> {
  // Early return if no segments to process
  if (segments.length === 0) return []

  // Use iterative processing with a work queue to avoid recursion overhead
  interface WorkItem {
    segmentIndex: number
    params: Params[]
  }

  const queue: WorkItem[] = [{ segmentIndex: 0, params: [] }]
  let currentParams: Params[] = []

  while (queue.length > 0) {
    const { segmentIndex, params } = queue.shift()!

    // If we've processed all segments, this is our final result
    if (segmentIndex >= segments.length) {
      currentParams = params
      break
    }

    const current = segments[segmentIndex]

    // Skip segments without generateStaticParams and continue to next
    if (typeof current.generateStaticParams !== 'function') {
      queue.push({ segmentIndex: segmentIndex + 1, params })
      continue
    }

    // Configure fetchCache if specified
    if (current.config?.fetchCache !== undefined) {
      store.fetchCache = current.config.fetchCache
    }

    const nextParams: Params[] = []

    // If there are parent params, we need to process them.
    if (params.length > 0) {
      // Process each parent parameter combination
      for (const parentParams of params) {
        const result = await current.generateStaticParams({
          params: parentParams,
        })

        if (result.length > 0) {
          // Merge parent params with each result item
          for (const item of result) {
            nextParams.push({ ...parentParams, ...item })
          }
        } else if (isRoutePPREnabled) {
          throwEmptyGenerateStaticParamsError()
        } else {
          // No results, just pass through parent params
          nextParams.push(parentParams)
        }
      }
    } else {
      // No parent params, call generateStaticParams with empty object
      const result = await current.generateStaticParams({ params: {} })
      if (result.length === 0 && isRoutePPREnabled) {
        throwEmptyGenerateStaticParamsError()
      }

      nextParams.push(...result)
    }

    // Add next segment to work queue
    queue.push({ segmentIndex: segmentIndex + 1, params: nextParams })
  }

  return currentParams
}

function createReplacements(
  segment: Pick<AppSegment, 'paramType'>,
  paramValue: string | string[]
) {
  // Determine the prefix to use for the interception marker.
  let prefix: string
  if (segment.paramType) {
    prefix = interceptionPrefixFromParamType(segment.paramType) ?? ''
  } else {
    prefix = ''
  }

  return {
    pathname:
      prefix +
      encodeParam(paramValue, (value) =>
        // Only escape path delimiters if the value is a string, the following
        // version will URL encode the value.
        escapePathDelimiters(value, true)
      ),
    encodedPathname:
      prefix +
      encodeParam(
        paramValue,
        // URL encode the value.
        encodeURIComponent
      ),
  }
}

/**
 * Processes app directory segments to build route parameters from generateStaticParams functions.
 * This function walks through the segments array and calls generateStaticParams for each segment that has it,
 * combining parent parameters with child parameters to build the complete parameter combinations.
 * Uses iterative processing instead of recursion for better performance.
 *
 * @param segments - Array of app directory segments to process
 * @param store - Work store for tracking fetch cache configuration
 * @returns Promise that resolves to an array of all parameter combinations
 */
export async function buildAppStaticPaths({
  dir,
  page,
  route,
  distDir,
  cacheComponents,
  authInterrupts,
  segments,
  isrFlushToDisk,
  cacheHandler,
  cacheLifeProfiles,
  requestHeaders,
  cacheHandlers,
  cacheMaxMemorySize,
  fetchCacheKeyPrefix,
  nextConfigOutput,
  ComponentMod,
  isRoutePPREnabled = false,
  buildId,
  rootParamKeys,
}: {
  dir: string
  page: string
  route: NormalizedAppRoute
  cacheComponents: boolean
  authInterrupts: boolean
  segments: readonly Readonly<AppSegment>[]
  distDir: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  cacheHandler?: string
  cacheHandlers?: NextConfigComplete['cacheHandlers']
  cacheLifeProfiles?: {
    [profile: string]: import('../../server/use-cache/cache-life').CacheLife
  }
  cacheMaxMemorySize: number
  requestHeaders: IncrementalCache['requestHeaders']
  nextConfigOutput: 'standalone' | 'export' | undefined
  ComponentMod: AppPageModule | AppRouteModule
  isRoutePPREnabled: boolean
  buildId: string
  rootParamKeys: readonly string[]
}): Promise<StaticPathsResult> {
  if (
    segments.some((generate) => generate.config?.dynamicParams === true) &&
    nextConfigOutput === 'export'
  ) {
    throw new Error(
      '"dynamicParams: true" cannot be used with "output: export". See more info here: https://nextjs.org/docs/app/building-your-application/deploying/static-exports'
    )
  }

  ComponentMod.patchFetch()

  const incrementalCache = await createIncrementalCache({
    dir,
    distDir,
    cacheHandler,
    cacheHandlers,
    requestHeaders,
    fetchCacheKeyPrefix,
    flushToDisk: isrFlushToDisk,
    cacheMaxMemorySize,
  })

  // Extract segments that contribute to the pathname.
  // For AppPageRouteModule: Traverses the loader tree to find all segments (including
  //   interception routes in parallel slots) that match the pathname
  // For AppRouteRouteModule: Filters the segments array to get non-parallel route params
  const pathnameRouteParamSegments = extractPathnameRouteParamSegments(
    ComponentMod.routeModule,
    segments,
    route
  )

  const afterRunner = new AfterRunner()

  const store = createWorkStore({
    page,
    renderOpts: {
      incrementalCache,
      cacheLifeProfiles,
      supportsDynamicResponse: true,
      cacheComponents,
      experimental: {
        authInterrupts,
      },
      waitUntil: afterRunner.context.waitUntil,
      onClose: afterRunner.context.onClose,
      onAfterTaskError: afterRunner.context.onTaskError,
    },
    buildId,
    previouslyRevalidatedTags: [],
  })

  const routeParams = await ComponentMod.workAsyncStorage.run(
    store,
    generateRouteStaticParams,
    segments,
    store,
    isRoutePPREnabled
  )

  await afterRunner.executeAfter()

  let lastDynamicSegmentHadGenerateStaticParams = false
  for (const segment of segments) {
    // Check to see if there are any missing params for segments that have
    // dynamicParams set to false.
    if (
      segment.paramName &&
      segment.paramType &&
      segment.config?.dynamicParams === false
    ) {
      for (const params of routeParams) {
        if (segment.paramName in params) continue

        const relative = segment.filePath
          ? path.relative(dir, segment.filePath)
          : undefined

        throw new Error(
          `Segment "${relative}" exports "dynamicParams: false" but the param "${segment.paramName}" is missing from the generated route params.`
        )
      }
    }

    if (
      segment.paramName &&
      segment.paramType &&
      typeof segment.generateStaticParams !== 'function'
    ) {
      lastDynamicSegmentHadGenerateStaticParams = false
    } else if (typeof segment.generateStaticParams === 'function') {
      lastDynamicSegmentHadGenerateStaticParams = true
    }
  }

  // Determine if all the segments have had their parameters provided.
  const hadAllParamsGenerated =
    pathnameRouteParamSegments.length === 0 ||
    (routeParams.length > 0 &&
      routeParams.every((params) => {
        for (const { paramName } of pathnameRouteParamSegments) {
          if (paramName in params) continue
          return false
        }
        return true
      }))

  // TODO: dynamic params should be allowed to be granular per segment but
  // we need additional information stored/leveraged in the prerender
  // manifest to allow this behavior.
  const dynamicParams = segments.every(
    (segment) => segment.config?.dynamicParams !== false
  )

  const supportsRoutePreGeneration =
    hadAllParamsGenerated || process.env.NODE_ENV === 'production'

  const fallbackMode = dynamicParams
    ? supportsRoutePreGeneration
      ? isRoutePPREnabled
        ? FallbackMode.PRERENDER
        : FallbackMode.BLOCKING_STATIC_RENDER
      : undefined
    : FallbackMode.NOT_FOUND

  const prerenderedRoutesByPathname = new Map<string, PrerenderedRoute>()

  // Convert rootParamKeys to Set for O(1) lookup.
  const rootParamSet = new Set(rootParamKeys)

  if (hadAllParamsGenerated || isRoutePPREnabled) {
    let paramsToProcess = routeParams

    if (isRoutePPREnabled) {
      // Discover all unique combinations of the routeParams so we can generate
      // routes that won't throw on empty static shell for each of them if
      // they're available.
      paramsToProcess = generateAllParamCombinations(
        pathnameRouteParamSegments,
        routeParams,
        rootParamKeys
      )

      // Collect all the fallback route params for the segments.
      const fallbackRouteParams: FallbackRouteParam[] = []
      for (const segment of segments) {
        if (!segment.paramName || !segment.paramType) continue
        fallbackRouteParams.push({
          paramName: segment.paramName,
          paramType: segment.paramType,
        })
      }

      // Add the base route, this is the route with all the placeholders as it's
      // derived from the `page` string.
      prerenderedRoutesByPathname.set(page, {
        params: {},
        pathname: page,
        encodedPathname: page,
        fallbackRouteParams,
        fallbackMode: calculateFallbackMode(
          dynamicParams,
          rootParamKeys,
          fallbackMode
        ),
        fallbackRootParams: rootParamKeys,
        throwOnEmptyStaticShell: true,
      })
    }

    filterUniqueParams(
      pathnameRouteParamSegments,
      validateParams(
        page,
        isRoutePPREnabled,
        pathnameRouteParamSegments,
        rootParamKeys,
        paramsToProcess
      )
    ).forEach((params) => {
      let pathname = page
      let encodedPathname = page

      const fallbackRouteParams: FallbackRouteParam[] = []

      for (const { name, paramName, paramType } of pathnameRouteParamSegments) {
        const paramValue = params[paramName]

        if (!paramValue) {
          if (isRoutePPREnabled) {
            // Mark remaining params as fallback params.
            fallbackRouteParams.push({ paramName, paramType })
            for (
              let i =
                pathnameRouteParamSegments.findIndex(
                  (param) => param.paramName === paramName
                ) + 1;
              i < pathnameRouteParamSegments.length;
              i++
            ) {
              fallbackRouteParams.push({
                paramName: pathnameRouteParamSegments[i].paramName,
                paramType: pathnameRouteParamSegments[i].paramType,
              })
            }
            break
          } else {
            // This route is not complete, and we aren't performing a partial
            // prerender, so we should return, skipping this route.
            return
          }
        }

        const replacements = createReplacements({ paramType }, paramValue)

        pathname = pathname.replace(
          name,
          // We're replacing the segment name with the replacement pathname
          // which will include the interception marker prefix if it exists.
          replacements.pathname
        )

        encodedPathname = encodedPathname.replace(
          name,
          // We're replacing the segment name with the replacement encoded
          // pathname which will include the encoded param value.
          replacements.encodedPathname
        )
      }

      // Resolve all route params from the loader tree if this is from an
      // app page. This processes both regular route params and parallel route params.
      if (
        'loaderTree' in ComponentMod.routeModule.userland &&
        Array.isArray(ComponentMod.routeModule.userland.loaderTree)
      ) {
        resolveRouteParamsFromTree(
          ComponentMod.routeModule.userland.loaderTree,
          params,
          route,
          fallbackRouteParams
        )
      }

      const fallbackRootParams: string[] = []
      for (const { paramName } of fallbackRouteParams) {
        // If the param is a root param then we can add it to the fallback
        // root params.
        if (rootParamSet.has(paramName)) {
          fallbackRootParams.push(paramName)
        }
      }

      pathname = normalizePathname(pathname)

      prerenderedRoutesByPathname.set(pathname, {
        params,
        pathname,
        encodedPathname: normalizePathname(encodedPathname),
        fallbackRouteParams,
        fallbackMode: calculateFallbackMode(
          dynamicParams,
          fallbackRootParams,
          fallbackMode
        ),
        fallbackRootParams,
        throwOnEmptyStaticShell: true,
      })
    })
  }

  const prerenderedRoutes =
    prerenderedRoutesByPathname.size > 0 ||
    lastDynamicSegmentHadGenerateStaticParams
      ? [...prerenderedRoutesByPathname.values()]
      : undefined

  // Now we have to set the throwOnEmptyStaticShell for each of the routes.
  if (prerenderedRoutes && cacheComponents) {
    assignErrorIfEmpty(prerenderedRoutes, pathnameRouteParamSegments)
  }

  return { fallbackMode, prerenderedRoutes }
}
