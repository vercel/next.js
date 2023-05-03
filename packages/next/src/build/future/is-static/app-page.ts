import { ServerRuntime } from '../../../../types'
import { isEdgeRuntime } from '../../../lib/is-edge-runtime'
import {
  LoadComponentsReturnType,
  loadComponents,
} from '../../../server/load-components'
import { AppConfig, GenerateParams, collectGenerateParams } from '../../utils'
import { EdgeFunctionDefinition } from '../../webpack/plugins/middleware-plugin'
import { getRuntimeContext } from '../../../server/web/sandbox'
import { AssetBinding } from '../../webpack/loaders/get-module-build-info'
import path from 'path'
import { AppRouteUserlandModule } from '../../../server/future/route-modules/app-route/module'
import { StaticGenerationAsyncStorage } from '../../../client/components/static-generation-async-storage'
import { isDynamicRoute } from '../../../shared/lib/router/utils/is-dynamic'
import { parseGenerateStaticParamsResult } from './helpers/parse-static-paths'
import { StaticGenerationAsyncStorageWrapper } from '../../../server/async-storage/static-generation-async-storage-wrapper'
import { IncrementalCache } from '../../../server/lib/incremental-cache'
import { patchFetch } from '../../../server/lib/patch-fetch'
import { nodeFs } from '../../../server/lib/node-fs-methods'

export type IsAppPageStaticResult = {
  isStatic?: boolean
  prerenderRoutes?: string[]
  encodedPrerenderRoutes?: string[]
  prerenderFallback?: boolean | 'blocking'
  isNextImageImported?: boolean
  traceIncludes?: string[]
  traceExcludes?: string[]
  appConfig?: AppConfig
}

export async function generateStaticParams({
  page,
  distDir,
  configFileName,
  generateParams,
  isrFlushToDisk,
  incrementalCacheHandlerPath,
  requestHeaders,
  maxMemoryCacheSize,
  fetchCacheKeyPrefix,
  staticGenerationAsyncStorage,
  serverHooks,
}: {
  page: string
  configFileName: string
  generateParams: GenerateParams
  incrementalCacheHandlerPath: string | undefined
  distDir: string
  isrFlushToDisk: boolean | undefined
  fetchCacheKeyPrefix: string | undefined
  maxMemoryCacheSize: number | undefined
  requestHeaders: IncrementalCache['requestHeaders']
  staticGenerationAsyncStorage: Parameters<
    typeof patchFetch
  >[0]['staticGenerationAsyncStorage']
  serverHooks: Parameters<typeof patchFetch>[0]['serverHooks']
}) {
  patchFetch({
    staticGenerationAsyncStorage,
    serverHooks,
  })

  let CacheHandler: any

  if (incrementalCacheHandlerPath) {
    CacheHandler = require(incrementalCacheHandlerPath)
    CacheHandler = CacheHandler.default || CacheHandler
  }

  const incrementalCache = new IncrementalCache({
    fs: nodeFs,
    dev: true,
    appDir: true,
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
    CurCacheHandler: CacheHandler,
    requestHeaders,
  })

  return StaticGenerationAsyncStorageWrapper.wrap(
    staticGenerationAsyncStorage,
    {
      pathname: page,
      renderOpts: {
        originalPathname: page,
        incrementalCache,
        supportsDynamicHTML: true,
        isRevalidate: false,
        isBot: false,
      },
    },
    async () => {
      const pageEntry = generateParams[generateParams.length - 1]

      if (typeof pageEntry?.getStaticPaths === 'function') {
        throw new Error(
          'You should use `generateStaticParams` instead of `getStaticPaths` in your page'
        )
      }

      // if generateStaticParams is being used we iterate over them
      // collecting them from each level
      type Params = Array<Record<string, string | string[]>>
      let hadAllParamsGenerated = false

      const buildParams = async (
        paramsItems: Params = [{}],
        idx = 0
      ): Promise<Params> => {
        const curGenerate = generateParams[idx]

        if (idx === generateParams.length) {
          return paramsItems
        }
        if (
          typeof curGenerate.generateStaticParams !== 'function' &&
          idx < generateParams.length
        ) {
          if (curGenerate.isDynamicSegment) {
            // This dynamic level has no generateStaticParams so we change
            // this flag to false, but it could be covered by a later
            // generateStaticParams so it could be set back to true.
            hadAllParamsGenerated = false
          }
          return buildParams(paramsItems, idx + 1)
        }
        hadAllParamsGenerated = true

        const newParams = []

        for (const params of paramsItems) {
          const result = await curGenerate.generateStaticParams({ params })
          // TODO: validate the result is valid here or wait for
          // buildStaticPaths to validate?
          for (const item of result) {
            newParams.push({ ...params, ...item })
          }
        }

        if (idx < generateParams.length) {
          return buildParams(newParams, idx + 1)
        }
        return newParams
      }
      const builtParams = await buildParams()
      const fallback = !generateParams.some(
        // TODO: dynamic params should be allowed
        // to be granular per segment but we need
        // additional information stored/leveraged in
        // the prerender-manifest to allow this behavior
        (generate) => generate.config?.dynamicParams === false
      )

      if (!hadAllParamsGenerated) {
        return {
          paths: undefined,
          fallback:
            process.env.NODE_ENV === 'production' && isDynamicRoute(page)
              ? true
              : undefined,
          encodedPaths: undefined,
        }
      }

      return parseGenerateStaticParamsResult(
        {
          fallback,
          paths: builtParams.map((params) => ({ params })),
        },
        { page, configFileName }
      )
    }
  )
}

export async function isAppPageStatic({
  page,
  distDir,
  configFileName,
  edgeInfo,
  pageRuntime,
  hasServerComponents,
  originalAppPath,
  isrFlushToDisk,
  maxMemoryCacheSize,
  incrementalCacheHandlerPath,
  fetchCacheKeyPrefix,
}: {
  page: string
  pageRuntime?: ServerRuntime
  distDir: string
  configFileName: string
  edgeInfo?: EdgeFunctionDefinition
  hasServerComponents?: boolean
  originalAppPath?: string
  isrFlushToDisk?: boolean
  maxMemoryCacheSize?: number
  incrementalCacheHandlerPath?: string
  fetchCacheKeyPrefix: string | undefined
}): Promise<IsAppPageStaticResult> {
  let componentsResult: LoadComponentsReturnType
  let prerenderRoutes: Array<string> | undefined
  let encodedPrerenderRoutes: Array<string> | undefined
  let prerenderFallback: boolean | 'blocking' | undefined
  let appConfig: AppConfig = {}

  if (isEdgeRuntime(pageRuntime) && edgeInfo) {
    const runtime = await getRuntimeContext({
      paths: edgeInfo.files.map((file: string) => path.join(distDir, file)),
      env: edgeInfo.env,
      edgeFunctionEntry: {
        ...edgeInfo,
        wasm: (edgeInfo.wasm ?? []).map((binding: AssetBinding) => ({
          ...binding,
          filePath: path.join(distDir, binding.filePath),
        })),
      },
      name: edgeInfo.name,
      useCache: true,
      distDir,
    })
    const mod =
      runtime.context._ENTRIES[`middleware_${edgeInfo.name}`].ComponentMod

    componentsResult = {
      Component: mod.default,
      ComponentMod: mod,
      pageConfig: mod.config || {},
      // @ts-expect-error this is not needed during require
      buildManifest: {},
      reactLoadableManifest: {},
      getServerSideProps: mod.getServerSideProps,
      getStaticPaths: mod.getStaticPaths,
      getStaticProps: mod.getStaticProps,
    }
  } else {
    componentsResult = await loadComponents({
      distDir,
      pathname: originalAppPath || page,
      hasServerComponents: !!hasServerComponents,
      isAppPath: true,
    })
  }

  const tree = componentsResult.ComponentMod.tree

  // This is present on the new route modules.
  const userland: AppRouteUserlandModule | undefined =
    componentsResult.ComponentMod.routeModule?.userland

  const staticGenerationAsyncStorage: StaticGenerationAsyncStorage =
    componentsResult.ComponentMod.staticGenerationAsyncStorage
  if (!staticGenerationAsyncStorage) {
    throw new Error(
      'Invariant: staticGenerationAsyncStorage should be defined on the module'
    )
  }

  const serverHooks = componentsResult.ComponentMod.serverHooks
  if (!serverHooks) {
    throw new Error('Invariant: serverHooks should be defined on the module')
  }

  const generateParams: GenerateParams = userland
    ? [
        {
          config: {
            revalidate: userland.revalidate,
            dynamic: userland.dynamic,
            dynamicParams: userland.dynamicParams,
          },
          generateStaticParams: userland.generateStaticParams,
          segmentPath: page,
        },
      ]
    : await collectGenerateParams(tree)

  appConfig = generateParams.reduce(
    (builtConfig: AppConfig, curGenParams): AppConfig => {
      const {
        dynamic,
        fetchCache,
        preferredRegion,
        revalidate: curRevalidate,
      } = curGenParams?.config || {}

      // TODO: should conflicting configs here throw an error
      // e.g. if layout defines one region but page defines another
      if (typeof builtConfig.preferredRegion === 'undefined') {
        builtConfig.preferredRegion = preferredRegion
      }
      if (typeof builtConfig.dynamic === 'undefined') {
        builtConfig.dynamic = dynamic
      }
      if (typeof builtConfig.fetchCache === 'undefined') {
        builtConfig.fetchCache = fetchCache
      }

      // any revalidate number overrides false
      // shorter revalidate overrides longer (initially)
      if (typeof builtConfig.revalidate === 'undefined') {
        builtConfig.revalidate = curRevalidate
      }
      if (
        typeof curRevalidate === 'number' &&
        (typeof builtConfig.revalidate !== 'number' ||
          curRevalidate < builtConfig.revalidate)
      ) {
        builtConfig.revalidate = curRevalidate
      }
      return builtConfig
    },
    {}
  )

  if (appConfig.dynamic === 'force-dynamic') {
    appConfig.revalidate = 0
  }

  if (isDynamicRoute(page)) {
    ;({
      paths: prerenderRoutes,
      fallback: prerenderFallback,
      encodedPaths: encodedPrerenderRoutes,
    } = await generateStaticParams({
      page,
      serverHooks,
      staticGenerationAsyncStorage,
      configFileName,
      generateParams,
      distDir,
      requestHeaders: {},
      isrFlushToDisk,
      maxMemoryCacheSize,
      incrementalCacheHandlerPath,
      fetchCacheKeyPrefix,
    }))
  }

  const isNextImageImported = (globalThis as any).__NEXT_IMAGE_IMPORTED

  return {
    isStatic: true,
    prerenderRoutes,
    prerenderFallback,
    encodedPrerenderRoutes,
    isNextImageImported,
    appConfig,
  }
}
