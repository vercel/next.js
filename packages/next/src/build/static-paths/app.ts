import {
  IncrementalCache,
  type CacheHandler,
} from '../../server/lib/incremental-cache'
import type { AppPageModule } from '../../server/route-modules/app-page/module.compiled'
import type { AppSegment } from '../segment-config/app/app-segments'
import type { StaticPathsResult } from './types'
import type { Params } from '../../server/request/params'

import path from 'path'
import {
  FallbackMode,
  fallbackModeToStaticPathsResult,
} from '../../lib/fallback'
import * as ciEnvironment from '../../server/ci-info'
import { formatDynamicImportPath } from '../../lib/format-dynamic-import-path'
import { interopDefault } from '../../lib/interop-default'
import { AfterRunner } from '../../server/after/run-with-after'
import { createWorkStore } from '../../server/async-storage/work-store'
import { nodeFs } from '../../server/lib/node-fs-methods'
import { getParamKeys } from '../../server/request/fallback-params'
import { buildStaticPaths } from './pages'

export async function buildAppStaticPaths({
  dir,
  page,
  distDir,
  dynamicIO,
  authInterrupts,
  configFileName,
  segments,
  isrFlushToDisk,
  cacheHandler,
  cacheLifeProfiles,
  requestHeaders,
  maxMemoryCacheSize,
  fetchCacheKeyPrefix,
  nextConfigOutput,
  ComponentMod,
  isRoutePPREnabled,
  buildId,
}: {
  dir: string
  page: string
  dynamicIO: boolean
  authInterrupts: boolean
  configFileName: string
  segments: AppSegment[]
  distDir: string
  isrFlushToDisk?: boolean
  fetchCacheKeyPrefix?: string
  cacheHandler?: string
  cacheLifeProfiles?: {
    [profile: string]: import('../../server/use-cache/cache-life').CacheLife
  }
  maxMemoryCacheSize?: number
  requestHeaders: IncrementalCache['requestHeaders']
  nextConfigOutput: 'standalone' | 'export' | undefined
  ComponentMod: AppPageModule
  isRoutePPREnabled: boolean | undefined
  buildId: string
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

  let CurCacheHandler: typeof CacheHandler | undefined
  if (cacheHandler) {
    CurCacheHandler = interopDefault(
      await import(formatDynamicImportPath(dir, cacheHandler)).then(
        (mod) => mod.default || mod
      )
    )
  }

  const incrementalCache = new IncrementalCache({
    fs: nodeFs,
    dev: true,
    dynamicIO,
    flushToDisk: isrFlushToDisk,
    serverDistDir: path.join(distDir, 'server'),
    fetchCacheKeyPrefix,
    maxMemoryCacheSize,
    getPrerenderManifest: () => ({
      version: -1 as any, // letting us know this doesn't conform to spec
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: null as any, // `preview` is special case read in next-dev-server
    }),
    CurCacheHandler,
    requestHeaders,
    minimalMode: ciEnvironment.hasNextSupport,
  })

  const paramKeys = new Set<string>()

  const staticParamKeys = new Set<string>()
  for (const segment of segments) {
    if (segment.param) {
      paramKeys.add(segment.param)

      if (segment.config?.dynamicParams === false) {
        staticParamKeys.add(segment.param)
      }
    }
  }

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
      buildId,
    },
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

  // Determine if all the segments have had their parameters provided. If there
  // was no dynamic parameters, then we've collected all the params.
  const hadAllParamsGenerated =
    paramKeys.size === 0 ||
    (routeParams.length > 0 &&
      routeParams.every((params) => {
        for (const key of paramKeys) {
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

  let result: Partial<StaticPathsResult> = {
    fallbackMode,
    prerenderedRoutes: lastDynamicSegmentHadGenerateStaticParams
      ? []
      : undefined,
  }

  if (hadAllParamsGenerated && fallbackMode) {
    result = await buildStaticPaths({
      staticPathsResult: {
        fallback: fallbackModeToStaticPathsResult(fallbackMode),
        paths: routeParams.map((params) => ({ params })),
      },
      page,
      configFileName,
      appDir: true,
    })
  }

  // If the fallback mode is a prerender, we want to include the dynamic
  // route in the prerendered routes too.
  if (isRoutePPREnabled) {
    result.prerenderedRoutes ??= []
    result.prerenderedRoutes.unshift({
      path: page,
      encoded: page,
      fallbackRouteParams: getParamKeys(page),
    })
  }

  await afterRunner.executeAfter()

  return result
}
