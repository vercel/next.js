import type { NextConfig } from './config'
import { VALID_LOADERS } from '../shared/lib/image-config'

import { z } from 'next/dist/compiled/zod'
import type zod from 'next/dist/compiled/zod'

import type { SizeLimit } from '../types'
import type {
  ExportPathMap,
  TurboLoaderItem,
  TurboRuleConfigItem,
  TurboRuleConfigItemOptions,
  TurboRuleConfigItemOrShortcut,
} from './config-shared'
import type {
  Header,
  Rewrite,
  RouteHas,
  Redirect,
} from '../lib/load-custom-routes'
import { SUPPORTED_TEST_RUNNERS_LIST } from '../cli/next-test'

// A custom zod schema for the SizeLimit type
const zSizeLimit = z.custom<SizeLimit>((val) => {
  if (typeof val === 'number' || typeof val === 'string') {
    return true
  }
  return false
})

const zExportMap: zod.ZodType<ExportPathMap> = z.record(
  z.string(),
  z.object({
    page: z.string(),
    query: z.any(), // NextParsedUrlQuery
    // private optional properties
    _fallbackRouteParams: z.array(z.string()).optional(),
    _isAppDir: z.boolean().optional(),
    _isDynamicError: z.boolean().optional(),
    _isRoutePPREnabled: z.boolean().optional(),
    _isProspectiveRender: z.boolean().optional(),
  })
)

const zRouteHas: zod.ZodType<RouteHas> = z.union([
  z.object({
    type: z.enum(['header', 'query', 'cookie']),
    key: z.string(),
    value: z.string().optional(),
  }),
  z.object({
    type: z.literal('host'),
    key: z.undefined().optional(),
    value: z.string(),
  }),
])

const zRewrite: zod.ZodType<Rewrite> = z.object({
  source: z.string(),
  destination: z.string(),
  basePath: z.literal(false).optional(),
  locale: z.literal(false).optional(),
  has: z.array(zRouteHas).optional(),
  missing: z.array(zRouteHas).optional(),
  internal: z.boolean().optional(),
})

const zRedirect: zod.ZodType<Redirect> = z
  .object({
    source: z.string(),
    destination: z.string(),
    basePath: z.literal(false).optional(),
    locale: z.literal(false).optional(),
    has: z.array(zRouteHas).optional(),
    missing: z.array(zRouteHas).optional(),
    internal: z.boolean().optional(),
  })
  .and(
    z.union([
      z.object({
        statusCode: z.never().optional(),
        permanent: z.boolean(),
      }),
      z.object({
        statusCode: z.number(),
        permanent: z.never().optional(),
      }),
    ])
  )

const zHeader: zod.ZodType<Header> = z.object({
  source: z.string(),
  basePath: z.literal(false).optional(),
  locale: z.literal(false).optional(),
  headers: z.array(z.object({ key: z.string(), value: z.string() })),
  has: z.array(zRouteHas).optional(),
  missing: z.array(zRouteHas).optional(),

  internal: z.boolean().optional(),
})

const zTurboLoaderItem: zod.ZodType<TurboLoaderItem> = z.union([
  z.string(),
  z.object({
    loader: z.string(),
    // Any JSON value can be used as turbo loader options, so use z.any() here
    options: z.record(z.string(), z.any()),
  }),
])

const zTurboRuleConfigItemOptions: zod.ZodType<TurboRuleConfigItemOptions> =
  z.object({
    loaders: z.array(zTurboLoaderItem),
    as: z.string().optional(),
  })

const zTurboRuleConfigItem: zod.ZodType<TurboRuleConfigItem> = z.union([
  z.literal(false),
  z.record(
    z.string(),
    z.lazy(() => zTurboRuleConfigItem)
  ),
  zTurboRuleConfigItemOptions,
])

const zTurboRuleConfigItemOrShortcut: zod.ZodType<TurboRuleConfigItemOrShortcut> =
  z.union([z.array(zTurboLoaderItem), zTurboRuleConfigItem])

export const configSchema: zod.ZodType<NextConfig> = z.lazy(() =>
  z.strictObject({
    amp: z
      .object({
        canonicalBase: z.string().optional(),
      })
      .optional(),
    assetPrefix: z.string().optional(),
    basePath: z.string().optional(),
    bundlePagesRouterDependencies: z.boolean().optional(),
    cacheHandler: z.string().min(1).optional(),
    cacheMaxMemorySize: z.number().optional(),
    cleanDistDir: z.boolean().optional(),
    compiler: z
      .strictObject({
        emotion: z
          .union([
            z.boolean(),
            z.object({
              sourceMap: z.boolean().optional(),
              autoLabel: z
                .union([
                  z.literal('always'),
                  z.literal('dev-only'),
                  z.literal('never'),
                ])
                .optional(),
              labelFormat: z.string().min(1).optional(),
              importMap: z
                .record(
                  z.string(),
                  z.record(
                    z.string(),
                    z.object({
                      canonicalImport: z
                        .tuple([z.string(), z.string()])
                        .optional(),
                      styledBaseImport: z
                        .tuple([z.string(), z.string()])
                        .optional(),
                    })
                  )
                )
                .optional(),
            }),
          ])
          .optional(),
        reactRemoveProperties: z
          .union([
            z.boolean().optional(),
            z.object({
              properties: z.array(z.string()).optional(),
            }),
          ])
          .optional(),
        relay: z
          .object({
            src: z.string(),
            artifactDirectory: z.string().optional(),
            language: z.enum(['javascript', 'typescript', 'flow']).optional(),
            eagerEsModules: z.boolean().optional(),
          })
          .optional(),
        removeConsole: z
          .union([
            z.boolean().optional(),
            z.object({
              exclude: z.array(z.string()).min(1).optional(),
            }),
          ])
          .optional(),
        styledComponents: z.union([
          z.boolean().optional(),
          z.object({
            displayName: z.boolean().optional(),
            topLevelImportPaths: z.array(z.string()).optional(),
            ssr: z.boolean().optional(),
            fileName: z.boolean().optional(),
            meaninglessFileNames: z.array(z.string()).optional(),
            minify: z.boolean().optional(),
            transpileTemplateLiterals: z.boolean().optional(),
            namespace: z.string().min(1).optional(),
            pure: z.boolean().optional(),
            cssProp: z.boolean().optional(),
          }),
        ]),
        styledJsx: z.union([
          z.boolean().optional(),
          z.object({
            useLightningcss: z.boolean().optional(),
          }),
        ]),
        define: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
    compress: z.boolean().optional(),
    configOrigin: z.string().optional(),
    crossOrigin: z
      .union([z.literal('anonymous'), z.literal('use-credentials')])
      .optional(),
    deploymentId: z.string().optional(),
    devIndicators: z
      .object({
        appIsrStatus: z.boolean().optional(),
        buildActivity: z.boolean().optional(),
        buildActivityPosition: z
          .union([
            z.literal('bottom-left'),
            z.literal('bottom-right'),
            z.literal('top-left'),
            z.literal('top-right'),
          ])
          .optional(),
      })
      .optional(),
    distDir: z.string().min(1).optional(),
    env: z.record(z.string(), z.union([z.string(), z.undefined()])).optional(),
    eslint: z
      .strictObject({
        dirs: z.array(z.string().min(1)).optional(),
        ignoreDuringBuilds: z.boolean().optional(),
      })
      .optional(),
    excludeDefaultMomentLocales: z.boolean().optional(),
    experimental: z
      .strictObject({
        nodeMiddleware: z.boolean().optional(),
        after: z.boolean().optional(),
        appDocumentPreloading: z.boolean().optional(),
        appIsrStatus: z.boolean().optional(),
        appNavFailHandling: z.boolean().optional(),
        preloadEntriesOnStart: z.boolean().optional(),
        allowedRevalidateHeaderKeys: z.array(z.string()).optional(),
        amp: z
          .object({
            // AMP optimizer option is unknown, use z.any() here
            optimizer: z.any().optional(),
            skipValidation: z.boolean().optional(),
            validator: z.string().optional(),
          })
          .optional(),
        staleTimes: z
          .object({
            dynamic: z.number().optional(),
            static: z.number().optional(),
          })
          .optional(),
        cacheLife: z
          .record(
            z.object({
              stale: z.number().optional(),
              revalidate: z.number().optional(),
              expire: z.number().optional(),
            })
          )
          .optional(),
        cacheHandlers: z.record(z.string(), z.string().optional()).optional(),
        clientRouterFilter: z.boolean().optional(),
        clientRouterFilterRedirects: z.boolean().optional(),
        clientRouterFilterAllowedRate: z.number().optional(),
        cpus: z.number().optional(),
        memoryBasedWorkersCount: z.boolean().optional(),
        craCompat: z.boolean().optional(),
        caseSensitiveRoutes: z.boolean().optional(),
        clientSegmentCache: z.boolean().optional(),
        disableOptimizedLoading: z.boolean().optional(),
        disablePostcssPresetEnv: z.boolean().optional(),
        dynamicIO: z.boolean().optional(),
        inlineCss: z.boolean().optional(),
        esmExternals: z.union([z.boolean(), z.literal('loose')]).optional(),
        serverActions: z
          .object({
            bodySizeLimit: zSizeLimit.optional(),
            allowedOrigins: z.array(z.string()).optional(),
          })
          .optional(),
        // The original type was Record<string, any>
        extensionAlias: z.record(z.string(), z.any()).optional(),
        externalDir: z.boolean().optional(),
        externalMiddlewareRewritesResolve: z.boolean().optional(),
        fallbackNodePolyfills: z.literal(false).optional(),
        fetchCacheKeyPrefix: z.string().optional(),
        forceSwcTransforms: z.boolean().optional(),
        fullySpecified: z.boolean().optional(),
        gzipSize: z.boolean().optional(),
        imgOptConcurrency: z.number().int().optional().nullable(),
        imgOptTimeoutInSeconds: z.number().int().optional(),
        imgOptMaxInputPixels: z.number().int().optional(),
        imgOptSequentialRead: z.boolean().optional().nullable(),
        isrFlushToDisk: z.boolean().optional(),
        largePageDataBytes: z.number().optional(),
        linkNoTouchStart: z.boolean().optional(),
        manualClientBasePath: z.boolean().optional(),
        middlewarePrefetch: z.enum(['strict', 'flexible']).optional(),
        multiZoneDraftMode: z.boolean().optional(),
        cssChunking: z.union([z.boolean(), z.literal('strict')]).optional(),
        nextScriptWorkers: z.boolean().optional(),
        // The critter option is unknown, use z.any() here
        optimizeCss: z.union([z.boolean(), z.any()]).optional(),
        optimisticClientCache: z.boolean().optional(),
        parallelServerCompiles: z.boolean().optional(),
        parallelServerBuildTraces: z.boolean().optional(),
        ppr: z
          .union([z.boolean(), z.literal('incremental')])
          .readonly()
          .optional(),
        taint: z.boolean().optional(),
        prerenderEarlyExit: z.boolean().optional(),
        proxyTimeout: z.number().gte(0).optional(),
        scrollRestoration: z.boolean().optional(),
        sri: z
          .object({
            algorithm: z.enum(['sha256', 'sha384', 'sha512']).optional(),
          })
          .optional(),
        strictNextHead: z.boolean().optional(),
        swcPlugins: z
          // The specific swc plugin's option is unknown, use z.any() here
          .array(z.tuple([z.string(), z.record(z.string(), z.any())]))
          .optional(),
        swcTraceProfiling: z.boolean().optional(),
        // NonNullable<webpack.Configuration['experiments']>['buildHttp']
        urlImports: z.any().optional(),
        viewTransition: z.boolean().optional(),
        workerThreads: z.boolean().optional(),
        webVitalsAttribution: z
          .array(
            z.union([
              z.literal('CLS'),
              z.literal('FCP'),
              z.literal('FID'),
              z.literal('INP'),
              z.literal('LCP'),
              z.literal('TTFB'),
            ])
          )
          .optional(),
        // This is partial set of mdx-rs transform options we support, aligned
        // with next_core::next_config::MdxRsOptions. Ensure both types are kept in sync.
        mdxRs: z
          .union([
            z.boolean(),
            z.object({
              development: z.boolean().optional(),
              jsxRuntime: z.string().optional(),
              jsxImportSource: z.string().optional(),
              providerImportSource: z.string().optional(),
              mdxType: z.enum(['gfm', 'commonmark']).optional(),
            }),
          ])
          .optional(),
        typedRoutes: z.boolean().optional(),
        webpackBuildWorker: z.boolean().optional(),
        webpackMemoryOptimizations: z.boolean().optional(),
        turbo: z
          .object({
            loaders: z.record(z.string(), z.array(zTurboLoaderItem)).optional(),
            rules: z
              .record(z.string(), zTurboRuleConfigItemOrShortcut)
              .optional(),
            resolveAlias: z
              .record(
                z.string(),
                z.union([
                  z.string(),
                  z.array(z.string()),
                  z.record(
                    z.string(),
                    z.union([z.string(), z.array(z.string())])
                  ),
                ])
              )
              .optional(),
            resolveExtensions: z.array(z.string()).optional(),
            treeShaking: z.boolean().optional(),
            persistentCaching: z
              .union([z.number(), z.literal(false)])
              .optional(),
            memoryLimit: z.number().optional(),
            moduleIdStrategy: z.enum(['named', 'deterministic']).optional(),
            minify: z.boolean().optional(),
            sourceMaps: z.boolean().optional(),
          })
          .optional(),
        optimizePackageImports: z.array(z.string()).optional(),
        optimizeServerReact: z.boolean().optional(),
        clientTraceMetadata: z.array(z.string()).optional(),
        serverMinification: z.boolean().optional(),
        serverSourceMaps: z.boolean().optional(),
        useWasmBinary: z.boolean().optional(),
        useLightningcss: z.boolean().optional(),
        useEarlyImport: z.boolean().optional(),
        testProxy: z.boolean().optional(),
        defaultTestRunner: z.enum(SUPPORTED_TEST_RUNNERS_LIST).optional(),
        allowDevelopmentBuild: z.literal(true).optional(),
        reactCompiler: z.union([
          z.boolean(),
          z
            .object({
              compilationMode: z
                .enum(['infer', 'annotation', 'all'])
                .optional(),
              panicThreshold: z
                .enum(['ALL_ERRORS', 'CRITICAL_ERRORS', 'NONE'])
                .optional(),
            })
            .optional(),
        ]),
        staticGenerationRetryCount: z.number().int().optional(),
        staticGenerationMaxConcurrency: z.number().int().optional(),
        staticGenerationMinPagesPerWorker: z.number().int().optional(),
        typedEnv: z.boolean().optional(),
        serverComponentsHmrCache: z.boolean().optional(),
        authInterrupts: z.boolean().optional(),
        newDevOverlay: z.boolean().optional(),
        streamingMetadata: z.boolean().optional(),
        htmlLimitedBots: z.instanceof(RegExp).optional(),
        useCache: z.boolean().optional(),
        slowModuleDetection: z
          .object({
            buildTimeThresholdMs: z.number().int(),
          })
          .optional(),
      })
      .optional(),
    exportPathMap: z
      .function()
      .args(
        zExportMap,
        z.object({
          dev: z.boolean(),
          dir: z.string(),
          outDir: z.string().nullable(),
          distDir: z.string(),
          buildId: z.string(),
        })
      )
      .returns(z.union([zExportMap, z.promise(zExportMap)]))
      .optional(),
    generateBuildId: z
      .function()
      .args()
      .returns(
        z.union([
          z.string(),
          z.null(),
          z.promise(z.union([z.string(), z.null()])),
        ])
      )
      .optional(),
    generateEtags: z.boolean().optional(),
    headers: z
      .function()
      .args()
      .returns(z.promise(z.array(zHeader)))
      .optional(),
    httpAgentOptions: z
      .strictObject({ keepAlive: z.boolean().optional() })
      .optional(),
    i18n: z
      .strictObject({
        defaultLocale: z.string().min(1),
        domains: z
          .array(
            z.strictObject({
              defaultLocale: z.string().min(1),
              domain: z.string().min(1),
              http: z.literal(true).optional(),
              locales: z.array(z.string().min(1)).optional(),
            })
          )
          .optional(),
        localeDetection: z.literal(false).optional(),
        locales: z.array(z.string().min(1)),
      })
      .nullable()
      .optional(),
    images: z
      .strictObject({
        localPatterns: z
          .array(
            z.strictObject({
              pathname: z.string().optional(),
              search: z.string().optional(),
            })
          )
          .max(25)
          .optional(),
        remotePatterns: z
          .array(
            z.strictObject({
              hostname: z.string(),
              pathname: z.string().optional(),
              port: z.string().max(5).optional(),
              protocol: z.enum(['http', 'https']).optional(),
              search: z.string().optional(),
            })
          )
          .max(50)
          .optional(),
        unoptimized: z.boolean().optional(),
        contentSecurityPolicy: z.string().optional(),
        contentDispositionType: z.enum(['inline', 'attachment']).optional(),
        dangerouslyAllowSVG: z.boolean().optional(),
        deviceSizes: z
          .array(z.number().int().gte(1).lte(10000))
          .max(25)
          .optional(),
        disableStaticImages: z.boolean().optional(),
        domains: z.array(z.string()).max(50).optional(),
        formats: z
          .array(z.enum(['image/avif', 'image/webp']))
          .max(4)
          .optional(),
        imageSizes: z
          .array(z.number().int().gte(1).lte(10000))
          .min(0)
          .max(25)
          .optional(),
        loader: z.enum(VALID_LOADERS).optional(),
        loaderFile: z.string().optional(),
        minimumCacheTTL: z.number().int().gte(0).optional(),
        path: z.string().optional(),
        qualities: z
          .array(z.number().int().gte(1).lte(100))
          .min(1)
          .max(20)
          .optional(),
      })
      .optional(),
    logging: z
      .union([
        z.object({
          fetches: z
            .object({
              fullUrl: z.boolean().optional(),
              hmrRefreshes: z.boolean().optional(),
            })
            .optional(),
          incomingRequests: z
            .union([
              z.boolean(),
              z.object({
                ignore: z.array(z.instanceof(RegExp)),
              }),
            ])
            .optional(),
        }),
        z.literal(false),
      ])
      .optional(),
    modularizeImports: z
      .record(
        z.string(),
        z.object({
          transform: z.union([z.string(), z.record(z.string(), z.string())]),
          preventFullImport: z.boolean().optional(),
          skipDefaultConversion: z.boolean().optional(),
        })
      )
      .optional(),
    onDemandEntries: z
      .strictObject({
        maxInactiveAge: z.number().optional(),
        pagesBufferLength: z.number().optional(),
      })
      .optional(),
    output: z.enum(['standalone', 'export']).optional(),
    outputFileTracingRoot: z.string().optional(),
    outputFileTracingExcludes: z
      .record(z.string(), z.array(z.string()))
      .optional(),
    outputFileTracingIncludes: z
      .record(z.string(), z.array(z.string()))
      .optional(),
    pageExtensions: z.array(z.string()).min(1).optional(),
    poweredByHeader: z.boolean().optional(),
    productionBrowserSourceMaps: z.boolean().optional(),
    publicRuntimeConfig: z.record(z.string(), z.any()).optional(),
    reactProductionProfiling: z.boolean().optional(),
    reactStrictMode: z.boolean().nullable().optional(),
    reactMaxHeadersLength: z.number().nonnegative().int().optional(),
    redirects: z
      .function()
      .args()
      .returns(z.promise(z.array(zRedirect)))
      .optional(),
    rewrites: z
      .function()
      .args()
      .returns(
        z.promise(
          z.union([
            z.array(zRewrite),
            z.object({
              beforeFiles: z.array(zRewrite),
              afterFiles: z.array(zRewrite),
              fallback: z.array(zRewrite),
            }),
          ])
        )
      )
      .optional(),
    // sassOptions properties are unknown besides implementation, use z.any() here
    sassOptions: z
      .object({
        implementation: z.string().optional(),
      })
      .catchall(z.any())
      .optional(),
    serverExternalPackages: z.array(z.string()).optional(),
    serverRuntimeConfig: z.record(z.string(), z.any()).optional(),
    skipMiddlewareUrlNormalize: z.boolean().optional(),
    skipTrailingSlashRedirect: z.boolean().optional(),
    staticPageGenerationTimeout: z.number().optional(),
    expireTime: z.number().optional(),
    target: z.string().optional(),
    trailingSlash: z.boolean().optional(),
    transpilePackages: z.array(z.string()).optional(),
    typescript: z
      .strictObject({
        ignoreBuildErrors: z.boolean().optional(),
        tsconfigPath: z.string().min(1).optional(),
      })
      .optional(),
    useFileSystemPublicRoutes: z.boolean().optional(),
    // The webpack config type is unknown, use z.any() here
    webpack: z.any().nullable().optional(),
    watchOptions: z
      .strictObject({
        pollIntervalMs: z.number().positive().finite().optional(),
      })
      .optional(),
  })
)
