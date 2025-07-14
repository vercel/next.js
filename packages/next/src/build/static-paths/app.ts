import type { Params } from '../../server/request/params'
import type { AppPageModule } from '../../server/route-modules/app-page/module'
import type { AppSegment } from '../segment-config/app/app-segments'
import type { PrerenderedRoute, StaticPathsResult } from './types'

import path from 'node:path'
import { AfterRunner } from '../../server/after/run-with-after'
import { createWorkStore } from '../../server/async-storage/work-store'
import { FallbackMode } from '../../lib/fallback'
import { getRouteMatcher } from '../../shared/lib/router/utils/route-matcher'
import {
  getRouteRegex,
  type RouteRegex,
} from '../../shared/lib/router/utils/route-regex'
import type { IncrementalCache } from '../../server/lib/incremental-cache'
import { normalizePathname, encodeParam } from './utils'
import escapePathDelimiters from '../../shared/lib/router/utils/escape-path-delimiters'
import { createIncrementalCache } from '../../export/helpers/create-incremental-cache'
import type { NextConfigComplete } from '../../server/config-shared'

/**
 * Filters out duplicate parameters from a list of parameters.
 * This function uses a Map to efficiently store and retrieve unique parameter combinations.
 *
 * @param routeParamKeys - The keys of the parameters. These should be sorted to ensure consistent key generation.
 * @param routeParams - The list of parameter objects to filter.
 * @returns A new array containing only the unique parameter combinations.
 */
export function filterUniqueParams(
  routeParamKeys: readonly string[],
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
    for (const paramKey of routeParamKeys) {
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
 * Filters out all combinations of root params from a list of parameters.
 * This function extracts only the root parameters from each parameter object
 * and then filters out duplicate combinations using a Map for efficiency.
 *
 * Given the following root param ('lang'), and the following routeParams:
 *
 * ```
 * [
 *   { lang: 'en', region: 'US', slug: ['home'] },
 *   { lang: 'en', region: 'US', slug: ['about'] },
 *   { lang: 'fr', region: 'CA', slug: ['about'] },
 * ]
 * ```
 *
 * The result will be:
 *
 * ```
 * [
 *   { lang: 'en', region: 'US' },
 *   { lang: 'fr', region: 'CA' },
 * ]
 * ```
 *
 * @param rootParamKeys - The keys of the root params. These should be sorted
 *   to ensure consistent key generation for the internal Map.
 * @param routeParams - The list of parameter objects to filter.
 * @returns A new array containing only the unique combinations of root params.
 */
export function filterUniqueRootParamsCombinations(
  rootParamKeys: readonly string[],
  routeParams: readonly Params[]
): Params[] {
  // A Map is used to store unique combinations of root parameters.
  // The key of the Map is a string representation of the root parameter
  // combination, and the value is the `Params` object containing only
  // the root parameters.
  const combinations = new Map<string, Params>()

  // Iterate over each parameter object in the input array.
  for (const params of routeParams) {
    const combination: Params = {} // Initialize an object to hold only the root parameters.
    let key = '' // Initialize an empty string to build the unique key for the current root parameter combination.

    // Iterate through the `rootParamKeys` (which are assumed to be sorted).
    // This consistent order is crucial for generating a stable and unique key
    // for each root parameter combination.
    for (const rootKey of rootParamKeys) {
      const value = params[rootKey]
      combination[rootKey] = value // Add the root parameter and its value to the combination object.

      // Construct a part of the key using the root parameter key and its value.
      // A type prefix (`A:` for Array, `S:` for String, `U:` for undefined) is added to the value
      // to prevent collisions. This ensures that different types with the same
      // string representation are treated as distinct.
      let valuePart: string
      if (Array.isArray(value)) {
        valuePart = `A:${value.join(',')}`
      } else if (value === undefined) {
        valuePart = `U:undefined`
      } else {
        valuePart = `S:${value}`
      }
      key += `${rootKey}:${valuePart}|`
    }

    // If the generated key is not already in the `combinations` Map, it means
    // this root parameter combination is unique so far. Add it to the Map.
    if (!combinations.has(key)) {
      combinations.set(key, combination)
    }
  }

  // Convert the Map's values (the unique root parameter `Params` objects)
  // back into an array and return it.
  return Array.from(combinations.values())
}

/**
 * Validates the parameters to ensure they're accessible and have the correct
 * types.
 *
 * @param page - The page to validate.
 * @param regex - The route regex.
 * @param isRoutePPREnabled - Whether the route has partial prerendering enabled.
 * @param routeParamKeys - The keys of the parameters.
 * @param rootParamKeys - The keys of the root params.
 * @param routeParams - The list of parameters to validate.
 * @returns The list of validated parameters.
 */
function validateParams(
  page: string,
  regex: RouteRegex,
  isRoutePPREnabled: boolean,
  routeParamKeys: readonly string[],
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

    for (const key of routeParamKeys) {
      const { repeat, optional } = regex.groups[key]

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
 * @param routeParamKeys - The keys of the route parameters.
 */
export function assignErrorIfEmpty(
  prerenderedRoutes: readonly PrerenderedRoute[],
  routeParamKeys: readonly string[]
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
    for (const key of routeParamKeys) {
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
          r.fallbackRouteParams?.length ?? 0
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
 * Builds the static paths for an app using `generateStaticParams`.
 *
 * @param params - The parameters for the build.
 * @returns The static paths.
 */
export async function buildAppStaticPaths({
  dir,
  page,
  distDir,
  dynamicIO,
  authInterrupts,
  segments,
  isrFlushToDisk,
  cacheHandler,
  cacheLifeProfiles,
  requestHeaders,
  cacheHandlers,
  maxMemoryCacheSize,
  fetchCacheKeyPrefix,
  nextConfigOutput,
  ComponentMod,
  isRoutePPREnabled = false,
  buildId,
  rootParamKeys,
}: {
  dir: string
  page: string
  dynamicIO: boolean
  authInterrupts: boolean
  segments: AppSegment[]
  distDir: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  cacheHandler?: string
  cacheHandlers?: NextConfigComplete['experimental']['cacheHandlers']
  cacheLifeProfiles?: {
    [profile: string]: import('../../server/use-cache/cache-life').CacheLife
  }
  maxMemoryCacheSize?: number
  requestHeaders: IncrementalCache['requestHeaders']
  nextConfigOutput: 'standalone' | 'export' | undefined
  ComponentMod: AppPageModule
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
    cacheMaxMemorySize: maxMemoryCacheSize,
  })

  const regex = getRouteRegex(page)
  const routeParamKeys = Object.keys(getRouteMatcher(regex)(page) || {})

  const afterRunner = new AfterRunner()

  const store = createWorkStore({
    page,
    // We're discovering the parameters here, so we don't have any unknown
    // ones.
    fallbackRouteParams: null,
    renderOpts: {
      incrementalCache,
      cacheLifeProfiles,
      supportsDynamicResponse: true,
      isRevalidate: false,
      experimental: {
        dynamicIO,
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
    async () => {
      async function builtRouteParams(
        parentsParams: Params[] = [],
        idx = 0
      ): Promise<Params[]> {
        // If we don't have any more to process, then we're done.
        if (idx === segments.length) return parentsParams

        const current = segments[idx]

        if (
          typeof current.generateStaticParams !== 'function' &&
          idx < segments.length
        ) {
          return builtRouteParams(parentsParams, idx + 1)
        }

        const params: Params[] = []

        if (current.generateStaticParams) {
          // fetchCache can be used to inform the fetch() defaults used inside
          // of generateStaticParams. revalidate and dynamic options don't come into
          // play within generateStaticParams.
          if (typeof current.config?.fetchCache !== 'undefined') {
            store.fetchCache = current.config.fetchCache
          }

          if (parentsParams.length > 0) {
            for (const parentParams of parentsParams) {
              const result = await current.generateStaticParams({
                params: parentParams,
              })

              for (const item of result) {
                params.push({ ...parentParams, ...item })
              }
            }
          } else {
            const result = await current.generateStaticParams({ params: {} })

            params.push(...result)
          }
        }

        if (idx < segments.length) {
          return builtRouteParams(params, idx + 1)
        }

        return params
      }

      return builtRouteParams()
    }
  )

  await afterRunner.executeAfter()

  let lastDynamicSegmentHadGenerateStaticParams = false
  for (const segment of segments) {
    // Check to see if there are any missing params for segments that have
    // dynamicParams set to false.
    if (
      segment.param &&
      segment.isDynamicSegment &&
      segment.config?.dynamicParams === false
    ) {
      for (const params of routeParams) {
        if (segment.param in params) continue

        const relative = segment.filePath
          ? path.relative(dir, segment.filePath)
          : undefined

        throw new Error(
          `Segment "${relative}" exports "dynamicParams: false" but the param "${segment.param}" is missing from the generated route params.`
        )
      }
    }

    if (
      segment.isDynamicSegment &&
      typeof segment.generateStaticParams !== 'function'
    ) {
      lastDynamicSegmentHadGenerateStaticParams = false
    } else if (typeof segment.generateStaticParams === 'function') {
      lastDynamicSegmentHadGenerateStaticParams = true
    }
  }

  // Determine if all the segments have had their parameters provided.
  const hadAllParamsGenerated =
    routeParamKeys.length === 0 ||
    (routeParams.length > 0 &&
      routeParams.every((params) => {
        for (const key of routeParamKeys) {
          if (key in params) continue
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

  if (hadAllParamsGenerated || isRoutePPREnabled) {
    if (isRoutePPREnabled) {
      // Discover all unique combinations of the rootParams so we can generate
      // routes that won't throw on empty static shell for each of them if they're available.
      routeParams.unshift(
        ...filterUniqueRootParamsCombinations(rootParamKeys, routeParams)
      )

      prerenderedRoutesByPathname.set(page, {
        params: {},
        pathname: page,
        encodedPathname: page,
        fallbackRouteParams: routeParamKeys,
        fallbackMode: dynamicParams
          ? // If the fallback params includes any root params, then we need to
            // perform a blocking static render.
            rootParamKeys.length > 0
            ? FallbackMode.BLOCKING_STATIC_RENDER
            : fallbackMode
          : FallbackMode.NOT_FOUND,
        fallbackRootParams: rootParamKeys,
        // This is set later after all the routes have been processed.
        throwOnEmptyStaticShell: true,
      })
    }

    filterUniqueParams(
      routeParamKeys,
      validateParams(
        page,
        regex,
        isRoutePPREnabled,
        routeParamKeys,
        rootParamKeys,
        routeParams
      )
    ).forEach((params) => {
      let pathname: string = page
      let encodedPathname: string = page

      let fallbackRouteParams: string[] = []

      for (const key of routeParamKeys) {
        if (fallbackRouteParams.length > 0) {
          // This is a partial route, so we should add the value to the
          // fallbackRouteParams.
          fallbackRouteParams.push(key)
          continue
        }

        let paramValue = params[key]

        if (!paramValue) {
          if (isRoutePPREnabled) {
            // This is a partial route, so we should add the value to the
            // fallbackRouteParams.
            fallbackRouteParams.push(key)
            continue
          } else {
            // This route is not complete, and we aren't performing a partial
            // prerender, so we should return, skipping this route.
            return
          }
        }

        const { repeat, optional } = regex.groups[key]
        let replaced = `[${repeat ? '...' : ''}${key}]`
        if (optional) {
          replaced = `[${replaced}]`
        }

        pathname = pathname.replace(
          replaced,
          encodeParam(paramValue, (value) => escapePathDelimiters(value, true))
        )
        encodedPathname = encodedPathname.replace(
          replaced,
          encodeParam(paramValue, encodeURIComponent)
        )
      }

      const fallbackRootParams = rootParamKeys.filter((param) =>
        fallbackRouteParams.includes(param)
      )

      pathname = normalizePathname(pathname)

      prerenderedRoutesByPathname.set(pathname, {
        params,
        pathname,
        encodedPathname: normalizePathname(encodedPathname),
        fallbackRouteParams,
        fallbackMode: dynamicParams
          ? // If the fallback params includes any root params, then we need to
            // perform a blocking static render.
            fallbackRootParams.length > 0
            ? FallbackMode.BLOCKING_STATIC_RENDER
            : fallbackMode
          : FallbackMode.NOT_FOUND,
        fallbackRootParams,
        // This is set later after all the routes have been processed.
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
  if (prerenderedRoutes && dynamicIO) {
    assignErrorIfEmpty(prerenderedRoutes, routeParamKeys)
  }

  return { fallbackMode, prerenderedRoutes }
}
