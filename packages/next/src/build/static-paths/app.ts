import type { ParamValue, Params } from '../../server/request/params'
import type { AppPageModule } from '../../server/route-modules/app-page/module'
import type { AppSegment } from '../segment-config/app/app-segments'
import type { StaticPathsResult } from './types'

import path from 'path'
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
 * Compares two parameters to see if they're equal.
 *
 * @param a - The first parameter.
 * @param b - The second parameter.
 * @returns Whether the parameters are equal.
 */
function areParamValuesEqual(a: ParamValue, b: ParamValue) {
  // If they're equal, then we can return true.
  if (a === b) {
    return true
  }

  // If they're both arrays, then we can return true if they have the same
  // length and all the items are the same.
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }

    return a.every((item) => b.includes(item))
  }

  // Otherwise, they're not equal.
  return false
}

/**
 * Filters out duplicate parameters from a list of parameters.
 *
 * @param routeParamKeys - The keys of the parameters.
 * @param routeParams - The list of parameters to filter.
 * @returns The list of unique parameters.
 */
function filterUniqueParams(
  routeParamKeys: readonly string[],
  routeParams: readonly Params[]
): Params[] {
  const unique: Params[] = []

  for (const params of routeParams) {
    let i = 0
    for (; i < unique.length; i++) {
      const item = unique[i]
      let j = 0
      for (; j < routeParamKeys.length; j++) {
        const key = routeParamKeys[j]

        // If the param is not the same, then we need to break out of the loop.
        if (!areParamValuesEqual(item[key], params[key])) {
          break
        }
      }

      // If we got to the end of the paramKeys array, then it means that we
      // found a duplicate. Skip it.
      if (j === routeParamKeys.length) {
        break
      }
    }

    // If we didn't get to the end of the unique array, then it means that we
    // found a duplicate. Skip it.
    if (i < unique.length) {
      continue
    }

    unique.push(params)
  }

  return unique
}

/**
 * Filters out all combinations of root params from a list of parameters.
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
 * @param rootParamKeys - The keys of the root params.
 * @param routeParams - The list of parameters to filter.
 * @returns The list of combinations of root params.
 */
function filterRootParamsCombinations(
  rootParamKeys: readonly string[],
  routeParams: readonly Params[]
): Params[] {
  const combinations: Params[] = []

  for (const params of routeParams) {
    const combination: Params = {}

    // Collect all root params. As soon as we don't find a root param, break.
    let i = 0
    for (; i < rootParamKeys.length; i++) {
      const key = rootParamKeys[i]
      if (params[key]) {
        combination[key] = params[key]
      } else {
        break
      }
    }

    // If we didn't find all root params, skip this combination. We only want to
    // generate combinations that have all root params.
    if (i < rootParamKeys.length) {
      continue
    }

    combinations.push(combination)
  }

  return combinations
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
}): Promise<Partial<StaticPathsResult>> {
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

  const result: Partial<StaticPathsResult> = {
    fallbackMode,
    prerenderedRoutes: lastDynamicSegmentHadGenerateStaticParams
      ? []
      : undefined,
  }

  if (hadAllParamsGenerated || isRoutePPREnabled) {
    if (isRoutePPREnabled) {
      // Discover all unique combinations of the rootParams so we can generate
      // shells for each of them if they're available.
      routeParams.unshift(
        ...filterRootParamsCombinations(rootParamKeys, routeParams)
      )

      result.prerenderedRoutes ??= []
      result.prerenderedRoutes.push({
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

      const fallbackRouteParams: string[] = []

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

      result.prerenderedRoutes ??= []
      result.prerenderedRoutes.push({
        pathname: normalizePathname(pathname),
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
      })
    })
  }

  await afterRunner.executeAfter()

  return result
}
