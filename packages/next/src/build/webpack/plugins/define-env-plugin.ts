import type { NextConfigComplete } from '../../../server/config-shared'
import type { MiddlewareMatcher } from '../../analysis/get-page-static-info'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { needsExperimentalReact } from '../../../lib/needs-experimental-react'

function errorIfEnvConflicted(config: NextConfigComplete, key: string) {
  const isPrivateKey = /^(?:NODE_.+)|^(?:__.+)$/i.test(key)
  const hasNextRuntimeKey = key === 'NEXT_RUNTIME'

  if (isPrivateKey || hasNextRuntimeKey) {
    throw new Error(
      `The key "${key}" under "env" in ${config.configFileName} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
    )
  }
}

export interface DefineEnvPluginOptions {
  isTurbopack: boolean
  allowedRevalidateHeaderKeys: string[] | undefined
  clientRouterFilters?: {
    staticFilter: ReturnType<
      import('../../../shared/lib/bloom-filter').BloomFilter['export']
    >
    dynamicFilter: ReturnType<
      import('../../../shared/lib/bloom-filter').BloomFilter['export']
    >
  }
  config: NextConfigComplete
  dev: boolean
  distDir: string
  fetchCacheKeyPrefix: string | undefined
  hasRewrites: boolean
  isClient: boolean
  isEdgeServer: boolean
  isNodeOrEdgeCompilation: boolean
  isNodeServer: boolean
  middlewareMatchers: MiddlewareMatcher[] | undefined
  previewModeId: string | undefined
}

export function getDefineEnv({
  isTurbopack,
  allowedRevalidateHeaderKeys,
  clientRouterFilters,
  config,
  dev,
  distDir,
  fetchCacheKeyPrefix,
  hasRewrites,
  isClient,
  isEdgeServer,
  isNodeOrEdgeCompilation,
  isNodeServer,
  middlewareMatchers,
  previewModeId,
}: DefineEnvPluginOptions) {
  return {
    // internal field to identify the plugin config
    __NEXT_DEFINE_ENV: 'true',

    ...Object.keys(process.env).reduce(
      (prev: { [key: string]: string }, key: string) => {
        if (key.startsWith('NEXT_PUBLIC_')) {
          prev[`process.env.${key}`] = JSON.stringify(process.env[key]!)
        }
        return prev
      },
      {}
    ),
    ...Object.keys(config.env).reduce((acc, key) => {
      errorIfEnvConflicted(config, key)

      return {
        ...acc,
        [`process.env.${key}`]: JSON.stringify(config.env[key]),
      }
    }, {}),
    ...(!isEdgeServer
      ? {}
      : {
          EdgeRuntime: JSON.stringify(
            /**
             * Cloud providers can set this environment variable to allow users
             * and library authors to have different implementations based on
             * the runtime they are running with, if it's not using `edge-runtime`
             */
            process.env.NEXT_EDGE_RUNTIME_PROVIDER || 'edge-runtime'
          ),
        }),
    'process.turbopack': JSON.stringify(isTurbopack),
    'process.env.TURBOPACK': JSON.stringify(isTurbopack),
    // TODO: enforce `NODE_ENV` on `process.env`, and add a test:
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    'process.env.NEXT_RUNTIME': JSON.stringify(
      isEdgeServer ? 'edge' : isNodeServer ? 'nodejs' : ''
    ),
    'process.env.NEXT_MINIMAL': JSON.stringify(''),
    'process.env.__NEXT_PPR': JSON.stringify(config.experimental.ppr === true),
    'process.env.__NEXT_ACTIONS_DEPLOYMENT_ID': JSON.stringify(
      config.experimental.useDeploymentIdServerActions
    ),
    'process.env.NEXT_DEPLOYMENT_ID': JSON.stringify(
      config.experimental.deploymentId || false
    ),
    'process.env.__NEXT_FETCH_CACHE_KEY_PREFIX':
      JSON.stringify(fetchCacheKeyPrefix),
    'process.env.__NEXT_PREVIEW_MODE_ID': JSON.stringify(previewModeId),
    'process.env.__NEXT_ALLOWED_REVALIDATE_HEADERS': JSON.stringify(
      allowedRevalidateHeaderKeys
    ),
    'process.env.__NEXT_MIDDLEWARE_MATCHERS': JSON.stringify(
      middlewareMatchers || []
    ),
    'process.env.__NEXT_MANUAL_CLIENT_BASE_PATH': JSON.stringify(
      config.experimental.manualClientBasePath
    ),
    'process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED': JSON.stringify(
      config.experimental.clientRouterFilter
    ),
    'process.env.__NEXT_CLIENT_ROUTER_S_FILTER': JSON.stringify(
      clientRouterFilters?.staticFilter
    ),
    'process.env.__NEXT_CLIENT_ROUTER_D_FILTER': JSON.stringify(
      clientRouterFilters?.dynamicFilter
    ),
    'process.env.__NEXT_OPTIMISTIC_CLIENT_CACHE': JSON.stringify(
      config.experimental.optimisticClientCache
    ),
    'process.env.__NEXT_MIDDLEWARE_PREFETCH': JSON.stringify(
      config.experimental.middlewarePrefetch
    ),
    'process.env.__NEXT_CROSS_ORIGIN': JSON.stringify(config.crossOrigin),
    'process.browser': JSON.stringify(isClient),
    'process.env.__NEXT_TEST_MODE': JSON.stringify(
      process.env.__NEXT_TEST_MODE
    ),
    // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
    ...(dev && (isClient || isEdgeServer)
      ? {
          'process.env.__NEXT_DIST_DIR': JSON.stringify(distDir),
        }
      : {}),
    'process.env.__NEXT_TRAILING_SLASH': JSON.stringify(config.trailingSlash),
    'process.env.__NEXT_BUILD_INDICATOR': JSON.stringify(
      config.devIndicators.buildActivity
    ),
    'process.env.__NEXT_BUILD_INDICATOR_POSITION': JSON.stringify(
      config.devIndicators.buildActivityPosition
    ),
    'process.env.__NEXT_STRICT_MODE': JSON.stringify(
      config.reactStrictMode === null ? false : config.reactStrictMode
    ),
    'process.env.__NEXT_STRICT_MODE_APP': JSON.stringify(
      // When next.config.js does not have reactStrictMode it's enabled by default.
      config.reactStrictMode === null ? true : config.reactStrictMode
    ),
    'process.env.__NEXT_OPTIMIZE_FONTS': JSON.stringify(
      !dev && config.optimizeFonts
    ),
    'process.env.__NEXT_OPTIMIZE_CSS': JSON.stringify(
      config.experimental.optimizeCss && !dev
    ),
    'process.env.__NEXT_SCRIPT_WORKERS': JSON.stringify(
      config.experimental.nextScriptWorkers && !dev
    ),
    'process.env.__NEXT_SCROLL_RESTORATION': JSON.stringify(
      config.experimental.scrollRestoration
    ),
    'process.env.__NEXT_IMAGE_OPTS': JSON.stringify({
      deviceSizes: config.images.deviceSizes,
      imageSizes: config.images.imageSizes,
      path: config.images.path,
      loader: config.images.loader,
      dangerouslyAllowSVG: config.images.dangerouslyAllowSVG,
      unoptimized: config?.images?.unoptimized,
      ...(dev
        ? {
            // pass domains in development to allow validating on the client
            domains: config.images.domains,
            remotePatterns: config.images?.remotePatterns,
            output: config.output,
          }
        : {}),
    }),
    'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(config.basePath),
    'process.env.__NEXT_STRICT_NEXT_HEAD': JSON.stringify(
      config.experimental.strictNextHead
    ),
    'process.env.__NEXT_HAS_REWRITES': JSON.stringify(hasRewrites),
    'process.env.__NEXT_CONFIG_OUTPUT': JSON.stringify(config.output),
    'process.env.__NEXT_I18N_SUPPORT': JSON.stringify(!!config.i18n),
    'process.env.__NEXT_I18N_DOMAINS': JSON.stringify(config.i18n?.domains),
    'process.env.__NEXT_ANALYTICS_ID': JSON.stringify(config.analyticsId), // TODO: remove in the next major version
    'process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE': JSON.stringify(
      config.skipMiddlewareUrlNormalize
    ),
    'process.env.__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE': JSON.stringify(
      config.experimental.externalMiddlewareRewritesResolve
    ),
    'process.env.__NEXT_MANUAL_TRAILING_SLASH': JSON.stringify(
      config.skipTrailingSlashRedirect
    ),
    'process.env.__NEXT_HAS_WEB_VITALS_ATTRIBUTION': JSON.stringify(
      config.experimental.webVitalsAttribution &&
        config.experimental.webVitalsAttribution.length > 0
    ),
    'process.env.__NEXT_WEB_VITALS_ATTRIBUTION': JSON.stringify(
      config.experimental.webVitalsAttribution
    ),
    'process.env.__NEXT_ASSET_PREFIX': JSON.stringify(config.assetPrefix),
    ...(isNodeOrEdgeCompilation
      ? {
          // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
          // This is typically found in unmaintained modules from the
          // pre-webpack era (common in server-side code)
          'global.GENTLY': JSON.stringify(false),
        }
      : undefined),
    ...(isNodeOrEdgeCompilation
      ? {
          'process.env.__NEXT_EXPERIMENTAL_REACT': JSON.stringify(
            needsExperimentalReact(config)
          ),
        }
      : undefined),
  }
}

export function getDefineEnvPlugin(options: DefineEnvPluginOptions) {
  return new webpack.DefinePlugin(getDefineEnv(options))
}
