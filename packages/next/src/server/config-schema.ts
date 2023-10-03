import { NextConfig } from './config'
import { VALID_LOADERS } from '../shared/lib/image-config'

import { z } from 'next/dist/compiled/zod'
import type zod from 'next/dist/compiled/zod'

import type { SizeLimit } from '../../types'

// A custom zod schema for the SizeLimit type
const zSizeLimit = z.custom<SizeLimit>((val) => {
  if (typeof val === 'number' || typeof val === 'string') {
    return true
  }
  return false
})

export const configSchema: zod.ZodType<NextConfig> = z.lazy(() =>
  z
    .object({
      amp: z
        .object({
          canonicalBase: z.string().optional(),
        })
        .catchall(z.never())
        .optional(),
      analyticsId: z.string().optional(),
      assetPrefix: z.string().optional(),
      basePath: z.string().optional(),
      cleanDistDir: z.boolean().optional(),
      compiler: z
        .object({
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
              topLevelImportPaths: z.array(z.string()).min(1).optional(),
              ssr: z.boolean().optional(),
              fileName: z.boolean().optional(),
              meaninglessFileNames: z.array(z.string()).min(1).optional(),
              minify: z.boolean().optional(),
              transpileTemplateLiterals: z.boolean().optional(),
              namespace: z.string().min(1).optional(),
              pure: z.boolean().optional(),
              cssProp: z.boolean().optional(),
            }),
          ]),
        })
        .catchall(z.never()),
      compress: z.boolean().optional(),
      configOrigin: z.string().optional(),
      crossOrigin: z
        .union([
          z.literal(false),
          z.literal('anonymous'),
          z.literal('use-credentials'),
        ])
        .optional(),
      devIndicators: z
        .object({
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
      env: z.record(z.any()).optional(),
      eslint: z
        .object({
          dirs: z.array(z.string().min(1)).optional(),
          ignoreDuringBuilds: z.boolean().optional(),
        })
        .catchall(z.never())
        .optional(),
      excludeDefaultMomentLocales: z.boolean().optional(),
      experimental: z
        .object({
          appDocumentPreloading: z.boolean().optional(),
          adjustFontFallbacks: z.boolean().optional(),
          adjustFontFallbacksWithSizeAdjust: z.boolean().optional(),
          allowedRevalidateHeaderKeys: z.array(z.any()).optional(),
          amp: z
            .object({
              optimizer: z.record(z.any()).optional(),
              skipValidation: z.boolean().optional(),
              validator: z.string().optional(),
            })
            .catchall(z.never())
            .optional(),
          clientRouterFilter: z.boolean().optional(),
          clientRouterFilterRedirects: z.boolean().optional(),
          clientRouterFilterAllowedRate: z.number().optional(),
          cpus: z.number().optional(),
          memoryBasedWorkersCount: z.boolean().optional(),
          craCompat: z.boolean().optional(),
          caseSensitiveRoutes: z.boolean().optional(),
          useDeploymentId: z.boolean().optional(),
          useDeploymentIdServerActions: z.boolean().optional(),
          deploymentId: z.string().optional(),
          disableOptimizedLoading: z.boolean().optional(),
          disablePostcssPresetEnv: z.boolean().optional(),
          esmExternals: z.union([z.boolean(), z.literal('loose')]).optional(),
          serverActions: z.boolean().optional(),
          serverActionsBodySizeLimit: zSizeLimit.optional(),
          extensionAlias: z.record(z.any()).optional(),
          externalDir: z.boolean().optional(),
          externalMiddlewareRewritesResolve: z.boolean().optional(),
          fallbackNodePolyfills: z.literal(false).optional(),
          fetchCacheKeyPrefix: z.string().optional(),
          forceSwcTransforms: z.boolean().optional(),
          fullySpecified: z.boolean().optional(),
          gzipSize: z.boolean().optional(),
          incrementalCacheHandlerPath: z.string().optional(),
          isrFlushToDisk: z.boolean().optional(),
          isrMemoryCacheSize: z.number().optional(),
          largePageDataBytes: z.number().optional(),
          manualClientBasePath: z.boolean().optional(),
          middlewarePrefetch: z.enum(['strict', 'flexible']).optional(),
          nextScriptWorkers: z.boolean().optional(),
          optimizeCss: z.union([z.boolean(), z.any()]).optional(),
          optimisticClientCache: z.boolean().optional(),
          outputFileTracingRoot: z.string().optional(),
          outputFileTracingExcludes: z.record(z.any()).optional(),
          outputFileTracingIgnores: z.array(z.any()).optional(),
          outputFileTracingIncludes: z.record(z.any()).optional(),
          ppr: z.boolean().optional(),
          proxyTimeout: z.number().gte(0).optional(),
          serverComponentsExternalPackages: z.array(z.string()).optional(),
          scrollRestoration: z.boolean().optional(),
          sri: z
            .object({
              algorithm: z.enum(['sha256', 'sha384', 'sha512']).optional(),
            })
            .optional(),
          strictNextHead: z.boolean().optional(),
          swcMinify: z.boolean().optional(),
          swcPlugins: z
            .array(z.tuple([z.string(), z.record(z.string(), z.any())]))
            .optional(),
          swcTraceProfiling: z.boolean().optional(),
          urlImports: z.array(z.string()).optional(),
          workerThreads: z.boolean().optional(),
          webVitalsAttribution: z.array(
            z.union([
              z.literal('CLS'),
              z.literal('FCP'),
              z.literal('FID'),
              z.literal('INP'),
              z.literal('LCP'),
              z.literal('TTFB'),
            ])
          ),
          mdxRs: z.boolean().optional(),
          typedRoutes: z.boolean().optional(),
          webpackBuildWorker: z.boolean().optional(),
          turbo: z
            .object({
              loaders: z.record(z.any()).optional(),
              rules: z.record(z.any()).optional(),
              resolveAlias: z.record(z.any()).optional(),
            })
            .catchall(z.never())
            .optional(),
          optimizePackageImports: z.array(z.any()).optional(),
          optimizeServerReact: z.boolean().optional(),
          instrumentationHook: z.boolean().optional(),
          turbotrace: z
            .object({
              logLevel: z
                .enum([
                  'bug',
                  'fatal',
                  'error',
                  'warning',
                  'hint',
                  'note',
                  'suggestions',
                  'info',
                ])
                .optional(),
              logAll: z.boolean().optional(),
              logDetail: z.boolean().optional(),
              contextDirectory: z.string().optional(),
              processCwd: z.string().optional(),
              memoryLimit: z.number().int().optional(),
            })
            .optional(),
          logging: z
            .object({
              level: z.literal('verbose').optional(),
              fullUrl: z.boolean().optional(),
            })
            .optional(),
          serverMinification: z.boolean().optional(),
          serverSourceMaps: z.boolean().optional(),
          bundlePagesExternals: z.boolean().optional(),
        })
        .catchall(z.never())
        .optional(),
      exportPathMap: z.any().optional(),
      generateBuildId: z.any().optional(),
      generateEtags: z.boolean().optional(),
      headers: z.any().optional(),
      httpAgentOptions: z
        .object({ keepAlive: z.boolean().optional() })
        .catchall(z.never())
        .optional(),
      i18n: z
        .object({
          defaultLocale: z.string().min(1),
          domains: z
            .array(
              z
                .object({
                  defaultLocale: z.string().min(1),
                  domain: z.string().min(1),
                  http: z.literal(true).optional(),
                  locales: z.array(z.string().min(1)).optional(),
                })
                .catchall(z.never())
            )
            .optional(),
          localeDetection: z.literal(false).optional(),
          locales: z.array(z.string().min(1)),
        })
        .catchall(z.never())
        .optional(),
      images: z
        .object({
          remotePatterns: z
            .array(
              z
                .object({
                  hostname: z.string(),
                  pathname: z.string().optional(),
                  port: z.string().max(5).optional(),
                  protocol: z.enum(['http', 'https']).optional(),
                })
                .catchall(z.never())
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
        })
        .catchall(z.never())
        .optional(),
      modularizeImports: z.record(z.any()).optional(),
      onDemandEntries: z
        .object({
          maxInactiveAge: z.number().optional(),
          pagesBufferLength: z.number().optional(),
        })
        .catchall(z.never())
        .optional(),
      optimizeFonts: z.boolean().optional(),
      output: z.enum(['standalone', 'export']).optional(),
      outputFileTracing: z.boolean().optional(),
      pageExtensions: z.array(z.any()).min(1).optional(),
      poweredByHeader: z.boolean().optional(),
      productionBrowserSourceMaps: z.boolean().optional(),
      publicRuntimeConfig: z.record(z.any()).optional(),
      reactProductionProfiling: z.boolean().optional(),
      reactStrictMode: z.boolean().optional(),
      redirects: z.any().optional(),
      rewrites: z.any().optional(),
      sassOptions: z.record(z.any()).optional(),
      serverRuntimeConfig: z.record(z.any()).optional(),
      skipMiddlewareUrlNormalize: z.boolean().optional(),
      skipTrailingSlashRedirect: z.boolean().optional(),
      staticPageGenerationTimeout: z.number().optional(),
      swcMinify: z.boolean().optional(),
      target: z.string().optional(),
      trailingSlash: z.boolean().optional(),
      transpilePackages: z.array(z.string()).optional(),
      typescript: z
        .object({
          ignoreBuildErrors: z.boolean().optional(),
          tsconfigPath: z.string().min(1).optional(),
        })
        .catchall(z.never())
        .optional(),
      useFileSystemPublicRoutes: z.boolean().optional(),
      webpack: z.any().optional(),
    })
    .catchall(z.never())
)
