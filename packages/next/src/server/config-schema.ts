import { NextConfig } from './config'
import type { JSONSchemaType } from 'ajv'
import { VALID_LOADERS } from '../shared/lib/image-config'

import { z } from 'zod'
import type zod from 'zod'

export const configSchemaZod: zod.ZodType<NextConfig> = z.lazy(() =>
  z.object({
    amp: z.object({
      canonicalBase: z.string().optional(),
    }),
    analyticsId: z.string().optional(),
    assetPrefix: z.string().optional(),
    basePath: z.string().optional(),
    cleanDistDir: z.boolean().optional(),
    compiler: z.object({
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
      relay: z.any().optional(),
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
    }),
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
    distDir: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    eslint: z.object({
      dirs: z.array(z.string()).optional(),
      ignoreDuringBuilds: z.boolean().optional(),
    }),
  })
)

const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    excludeDefaultMomentLocales: {
      type: 'boolean',
    },
    experimental: {
      additionalProperties: false,
      properties: {
        appDocumentPreloading: {
          type: 'boolean',
        },
        adjustFontFallbacks: {
          type: 'boolean',
        },
        adjustFontFallbacksWithSizeAdjust: {
          type: 'boolean',
        },
        allowedRevalidateHeaderKeys: {
          type: 'array',
        },
        amp: {
          additionalProperties: false,
          properties: {
            optimizer: {
              type: 'object',
            },
            skipValidation: {
              type: 'boolean',
            },
            validator: {
              type: 'string',
            },
          },
          type: 'object',
        },
        clientRouterFilter: {
          type: 'boolean',
        },
        clientRouterFilterRedirects: {
          type: 'boolean',
        },
        clientRouterFilterAllowedRate: {
          type: 'number',
        },
        cpus: {
          type: 'number',
        },
        memoryBasedWorkersCount: {
          type: 'boolean',
        },
        craCompat: {
          type: 'boolean',
        },
        caseSensitiveRoutes: {
          type: 'boolean',
        },
        useDeploymentId: {
          type: 'boolean',
        },
        useDeploymentIdServerActions: {
          type: 'boolean',
        },
        deploymentId: {
          type: 'string',
        },
        disableOptimizedLoading: {
          type: 'boolean',
        },
        disablePostcssPresetEnv: {
          type: 'boolean',
        },
        esmExternals: {
          oneOf: [
            {
              type: 'boolean',
            },
            {
              const: 'loose',
            },
          ] as any,
        },
        appDir: {
          type: 'boolean',
        },
        serverActions: {
          type: 'boolean',
        },
        serverActionsBodySizeLimit: {
          oneOf: [
            {
              type: 'number',
            },
            {
              type: 'string',
            },
          ] as any,
        },
        extensionAlias: {
          type: 'object',
        },
        externalDir: {
          type: 'boolean',
        },
        externalMiddlewareRewritesResolve: {
          type: 'boolean',
        },
        fallbackNodePolyfills: {
          type: 'boolean',
        },
        fetchCacheKeyPrefix: {
          type: 'string',
        },
        forceSwcTransforms: {
          type: 'boolean',
        },
        fullySpecified: {
          type: 'boolean',
        },
        gzipSize: {
          type: 'boolean',
        },
        incrementalCacheHandlerPath: {
          type: 'string',
        },
        isrFlushToDisk: {
          type: 'boolean',
        },
        isrMemoryCacheSize: {
          type: 'number',
        },
        largePageDataBytes: {
          type: 'number',
        },
        legacyBrowsers: {
          type: 'boolean',
        },
        manualClientBasePath: {
          type: 'boolean',
        },
        middlewarePrefetch: {
          // automatic typing doesn't like enum
          enum: ['strict', 'flexible'] as any,
          type: 'string',
        },
        newNextLinkBehavior: {
          type: 'boolean',
        },
        nextScriptWorkers: {
          type: 'boolean',
        },
        optimizeCss: {
          oneOf: [
            {
              type: 'boolean',
            },
            {
              type: 'object',
            },
          ] as any,
        },
        optimisticClientCache: {
          type: 'boolean',
        },
        outputFileTracingRoot: {
          nullable: true,
          type: 'string',
        },
        outputFileTracingExcludes: {
          type: 'object',
        },
        outputFileTracingIgnores: {
          type: 'array',
        },
        outputFileTracingIncludes: {
          type: 'object',
        },
        pageEnv: {
          type: 'boolean',
        },
        proxyTimeout: {
          minimum: 0,
          type: 'number',
        },
        serverComponentsExternalPackages: {
          items: {
            type: 'string',
          },
          type: 'array',
        },
        scrollRestoration: {
          type: 'boolean',
        },
        sharedPool: {
          type: 'boolean',
        },
        sri: {
          properties: {
            algorithm: {
              enum: ['sha256', 'sha384', 'sha512'] as any,
              type: 'string',
            },
          },
          type: 'object',
        },
        strictNextHead: {
          type: 'boolean',
        },
        swcFileReading: {
          type: 'boolean',
        },
        swcMinify: {
          type: 'boolean',
        },
        swcPlugins: {
          type: 'array',
        },
        swcTraceProfiling: {
          type: 'boolean',
        },
        urlImports: {
          items: {
            type: 'string',
          },
          type: 'array',
        },
        workerThreads: {
          type: 'boolean',
        },
        webVitalsAttribution: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'],
          } as any,
        },
        mdxRs: {
          type: 'boolean',
        },
        typedRoutes: {
          type: 'boolean',
        },
        webpackBuildWorker: {
          type: 'boolean',
        },
        turbo: {
          type: 'object',
          additionalProperties: false,
          properties: {
            loaders: {
              type: 'object',
            },
            resolveAlias: {
              type: 'object',
            },
          },
        },
        instrumentationHook: {
          type: 'boolean',
        },
        turbotrace: {
          type: 'object',
          properties: {
            logLevel: {
              type: 'string',
              enum: [
                'bug',
                'fatal',
                'error',
                'warning',
                'hint',
                'note',
                'suggestions',
                'info',
              ],
            } as any,
            logAll: {
              type: 'boolean',
            },
            logDetail: {
              type: 'boolean',
            },
            contextDirectory: {
              type: 'string',
            },
            processCwd: {
              type: 'string',
            },
            memoryLimit: {
              type: 'integer',
            },
          },
        },
        logging: {
          type: 'string',
        },
        serverMinification: {
          type: 'boolean',
        },
        serverSourceMaps: {
          type: 'boolean',
        },
      },
      type: 'object',
    },
    exportPathMap: {
      isFunction: true,
      errorMessage: 'must be a function that returns a Promise',
    } as any,
    generateBuildId: {
      isFunction: true,
      errorMessage: 'must be a function that returns a Promise',
    } as any,
    generateEtags: {
      type: 'boolean',
    },
    headers: {
      isFunction: true,
      errorMessage: 'must be a function that returns a Promise',
    } as any,
    httpAgentOptions: {
      additionalProperties: false,
      properties: {
        keepAlive: {
          type: 'boolean',
        },
      },
      type: 'object',
    },
    i18n: {
      additionalProperties: false,
      nullable: true,
      properties: {
        defaultLocale: {
          minLength: 1,
          type: 'string',
        },
        domains: {
          items: {
            additionalProperties: false,
            properties: {
              defaultLocale: {
                minLength: 1,
                type: 'string',
              },
              domain: {
                minLength: 1,
                type: 'string',
              },
              http: {
                type: 'boolean',
              },
              locales: {
                items: {
                  minLength: 1,
                  type: 'string',
                },
                type: 'array',
              },
            },
            type: 'object',
          },
          type: 'array',
        },
        localeDetection: {
          type: 'boolean',
        },
        locales: {
          items: {
            minLength: 1,
            type: 'string',
          },
          type: 'array',
        },
      },
      type: 'object',
    },
    images: {
      additionalProperties: false,
      nullable: true,
      properties: {
        remotePatterns: {
          nullable: true,
          items: {
            additionalProperties: false,
            properties: {
              hostname: {
                type: 'string',
              },
              pathname: {
                type: 'string',
              },
              port: {
                maxLength: 5,
                type: 'string',
              },
              protocol: {
                // automatic typing doesn't like enum
                enum: ['http', 'https'] as any,
                type: 'string',
              },
            },
            required: ['hostname'] as any,
            type: 'object',
          },
          maxItems: 50,
          type: 'array',
        },
        unoptimized: {
          type: 'boolean',
        },
        contentSecurityPolicy: {
          type: 'string',
          nullable: true,
        },
        contentDispositionType: {
          enum: ['inline', 'attachment'] as any, // automatic typing does not like enum
          type: 'string',
          nullable: true,
        },
        dangerouslyAllowSVG: {
          type: 'boolean',
          nullable: true,
        },
        deviceSizes: {
          items: {
            type: 'integer',
            minimum: 1,
            maximum: 10000,
          },
          maxItems: 25,
          type: 'array',
          nullable: true,
        },
        disableStaticImages: {
          type: 'boolean',
          nullable: true,
        },
        domains: {
          items: {
            type: 'string',
          },
          maxItems: 50,
          type: 'array',
          nullable: true,
        },
        formats: {
          items: {
            enum: ['image/avif', 'image/webp'], // automatic typing does not like enum
            type: 'string',
          } as any,
          maxItems: 4,
          type: 'array',
          nullable: true,
        },
        imageSizes: {
          items: {
            type: 'integer',
            minimum: 1,
            maximum: 10000,
          },
          minItems: 0,
          maxItems: 25,
          type: 'array',
          nullable: true,
        },
        loader: {
          // automatic typing does not like enum
          enum: VALID_LOADERS as any,
          type: 'string',
          nullable: true,
        },
        loaderFile: {
          type: 'string',
          nullable: true,
        },
        minimumCacheTTL: {
          type: 'integer',
          minimum: 0,
          nullable: true,
        },
        path: {
          type: 'string',
          nullable: true,
        },
      },
      type: 'object',
    },
    modularizeImports: {
      type: 'object',
    },
    onDemandEntries: {
      additionalProperties: false,
      properties: {
        maxInactiveAge: {
          type: 'number',
        },
        pagesBufferLength: {
          type: 'number',
        },
      },
      type: 'object',
    },
    optimizeFonts: {
      type: 'boolean',
    },
    output: {
      // automatic typing doesn't like enum
      enum: ['standalone', 'export'] as any,
      type: 'string',
    },
    outputFileTracing: {
      type: 'boolean',
    },
    pageExtensions: {
      minItems: 1,
      type: 'array',
    },
    poweredByHeader: {
      type: 'boolean',
    },
    productionBrowserSourceMaps: {
      type: 'boolean',
    },
    publicRuntimeConfig: {
      type: 'object',
    },
    reactProductionProfiling: {
      type: 'boolean',
    },
    reactStrictMode: {
      type: 'boolean',
    },
    redirects: {
      isFunction: true,
      errorMessage: 'must be a function that returns a Promise',
    } as any,
    rewrites: {
      isFunction: true,
      errorMessage: 'must be a function that returns a Promise',
    } as any,
    sassOptions: {
      type: 'object',
    },
    serverRuntimeConfig: {
      type: 'object',
    },
    skipMiddlewareUrlNormalize: {
      type: 'boolean',
    },
    skipTrailingSlashRedirect: {
      type: 'boolean',
    },
    staticPageGenerationTimeout: {
      type: 'number',
    },
    swcMinify: {
      type: 'boolean',
    },
    target: {
      type: 'string',
    },
    trailingSlash: {
      type: 'boolean',
    },
    transpilePackages: {
      items: {
        type: 'string',
      },
      type: 'array',
    },
    typescript: {
      additionalProperties: false,
      properties: {
        ignoreBuildErrors: {
          type: 'boolean',
        },
        tsconfigPath: {
          minLength: 1,
          type: 'string',
        },
      },
      type: 'object',
    },
    useFileSystemPublicRoutes: {
      type: 'boolean',
    },
    webpack: {
      isFunction: true,
      errorMessage:
        'must be a function that returns a webpack configuration object',
    } as any,
  },
} as JSONSchemaType<NextConfig & { configOrigin?: any; target?: any }>

// module.exports is used to get around an export bug with TypeScript
// and the Ajv automatic typing
module.exports = {
  configSchema,
}
