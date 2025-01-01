import type {
  I18NDomains,
  NextConfigComplete,
} from '../../../server/config-shared'
import type { MiddlewareMatcher } from '../../analysis/get-page-static-info'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { needsExperimentalReact } from '../../../lib/needs-experimental-react'
import { checkIsAppPPREnabled } from '../../../server/lib/experimental/ppr'

function errorIfEnvConflicted(config: NextConfigComplete, key: string) {
  const isPrivateKey = /^(?:NODE_.+)|^(?:__.+)$/i.test(key)
  const hasNextRuntimeKey = key === 'NEXT_RUNTIME'

  if (isPrivateKey || hasNextRuntimeKey) {
    throw new Error(
      `The key "${key}" under "env" in ${config.configFileName} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
    )
  }
}

type BloomFilter = ReturnType<
  import('../../../shared/lib/bloom-filter').BloomFilter['export']
>

export interface DefineEnvPluginOptions {
  isTurbopack: boolean
  clientRouterFilters?: {
    staticFilter: BloomFilter
    dynamicFilter: BloomFilter
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
}

interface DefineEnv {
  [key: string]:
    | string
    | string[]
    | boolean
    | MiddlewareMatcher[]
    | BloomFilter
    | Partial<NextConfigComplete['images']>
    | I18NDomains
}

interface SerializedDefineEnv {
  [key: string]: string
}

/**
 * Collects all environment variables that are using the `NEXT_PUBLIC_` prefix.
 */
export function getNextPublicEnvironmentVariables(): DefineEnv {
  const defineEnv: DefineEnv = {}
  for (const key in process.env) {
    if (key.startsWith('NEXT_PUBLIC_')) {
      const value = process.env[key]
      if (value != null) {
        defineEnv[`process.env.${key}`] = value
      }
    }
  }
  return defineEnv
}

/**
 * Collects the `env` config value from the Next.js config.
 */
export function getNextConfigEnv(config: NextConfigComplete): DefineEnv {
  // Refactored code below to use for-of
  const defineEnv: DefineEnv = {}
  const env = config.env
  for (const key in env) {
    const value = env[key]
    if (value != null) {
      errorIfEnvConflicted(config, key)
      defineEnv[`process.env.${key}`] = value
    }
  }
  return defineEnv
}

/**
 * Serializes the DefineEnv config so that it can be inserted into the code by Webpack/Turbopack, JSON stringifies each value.
 */
function serializeDefineEnv(defineEnv: DefineEnv): SerializedDefineEnv {
  const defineEnvStringified: SerializedDefineEnv = {}
  for (const key in defineEnv) {
    const value = defineEnv[key]
    defineEnvStringified[key] = JSON.stringify(value)
  }

  return defineEnvStringified
}

function getImageConfig(
  config: NextConfigComplete,
  dev: boolean
): { 'process.env.__NEXT_IMAGE_OPTS': Partial<NextConfigComplete['images']> } {
  return {
    'process.env.__NEXT_IMAGE_OPTS': {
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
            localPatterns: config.images?.localPatterns,
            output: config.output,
          }
        : {}),
    },
  }
}

export function getDefineEnv({
  isTurbopack,
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
}: DefineEnvPluginOptions): SerializedDefineEnv {
  const nextPublicEnv = getNextPublicEnvironmentVariables()
  const nextConfigEnv = getNextConfigEnv(config)

  const isPPREnabled = checkIsAppPPREnabled(config.experimental.ppr)
  const isDynamicIOEnabled = !!config.experimental.dynamicIO

  const defineEnv: DefineEnv = {
    // internal field to identify the plugin config
    __NEXT_DEFINE_ENV: true,

    ...nextPublicEnv,
    ...nextConfigEnv,
    ...(!isEdgeServer
      ? {}
      : {
          EdgeRuntime:
            /**
             * Cloud providers can set this environment variable to allow users
             * and library authors to have different implementations based on
             * the runtime they are running with, if it's not using `edge-runtime`
             */
            process.env.NEXT_EDGE_RUNTIME_PROVIDER ?? 'edge-runtime',

          // process should be only { env: {...} } for edge runtime.
          // For ignore avoid warn on `process.emit` usage but directly omit it.
          'process.emit': false,
        }),
    'process.turbopack': isTurbopack,
    'process.env.TURBOPACK': isTurbopack,
    // TODO: enforce `NODE_ENV` on `process.env`, and add a test:
    'process.env.NODE_ENV':
      dev || config.experimental.allowDevelopmentBuild
        ? 'development'
        : 'production',
    'process.env.NEXT_RUNTIME': isEdgeServer
      ? 'edge'
      : isNodeServer
        ? 'nodejs'
        : '',
    'process.env.NEXT_MINIMAL': '',
    'process.env.__NEXT_APP_NAV_FAIL_HANDLING': Boolean(
      config.experimental.appNavFailHandling
    ),
    'process.env.__NEXT_APP_ISR_INDICATOR': Boolean(
      config.devIndicators.appIsrStatus
    ),
    'process.env.__NEXT_PPR': isPPREnabled,
    'process.env.__NEXT_DYNAMIC_IO': isDynamicIOEnabled,
    'process.env.NEXT_DEPLOYMENT_ID': config.deploymentId || false,
    'process.env.__NEXT_FETCH_CACHE_KEY_PREFIX': fetchCacheKeyPrefix ?? '',
    ...(isTurbopack
      ? {}
      : {
          'process.env.__NEXT_MIDDLEWARE_MATCHERS': middlewareMatchers ?? [],
        }),
    'process.env.__NEXT_MANUAL_CLIENT_BASE_PATH':
      config.experimental.manualClientBasePath ?? false,
    'process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME': JSON.stringify(
      isNaN(Number(config.experimental.staleTimes?.dynamic))
        ? 0
        : config.experimental.staleTimes?.dynamic
    ),
    'process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME': JSON.stringify(
      isNaN(Number(config.experimental.staleTimes?.static))
        ? 5 * 60 // 5 minutes
        : config.experimental.staleTimes?.static
    ),
    'process.env.__NEXT_CLIENT_ROUTER_FILTER_ENABLED':
      config.experimental.clientRouterFilter ?? true,
    'process.env.__NEXT_CLIENT_ROUTER_S_FILTER':
      clientRouterFilters?.staticFilter ?? false,
    'process.env.__NEXT_CLIENT_ROUTER_D_FILTER':
      clientRouterFilters?.dynamicFilter ?? false,
    'process.env.__NEXT_CLIENT_SEGMENT_CACHE': Boolean(
      config.experimental.clientSegmentCache
    ),
    'process.env.__NEXT_OPTIMISTIC_CLIENT_CACHE':
      config.experimental.optimisticClientCache ?? true,
    'process.env.__NEXT_MIDDLEWARE_PREFETCH':
      config.experimental.middlewarePrefetch ?? 'flexible',
    'process.env.__NEXT_CROSS_ORIGIN': config.crossOrigin,
    'process.browser': isClient,
    'process.env.__NEXT_TEST_MODE': process.env.__NEXT_TEST_MODE ?? false,
    // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
    ...(dev && (isClient ?? isEdgeServer)
      ? {
          'process.env.__NEXT_DIST_DIR': distDir,
        }
      : {}),
    'process.env.__NEXT_TRAILING_SLASH': config.trailingSlash,
    'process.env.__NEXT_BUILD_INDICATOR':
      config.devIndicators.buildActivity ?? true,
    'process.env.__NEXT_BUILD_INDICATOR_POSITION':
      config.devIndicators.buildActivityPosition ?? 'bottom-right',
    'process.env.__NEXT_STRICT_MODE':
      config.reactStrictMode === null ? false : config.reactStrictMode,
    'process.env.__NEXT_STRICT_MODE_APP':
      // When next.config.js does not have reactStrictMode it's enabled by default.
      config.reactStrictMode === null ? true : config.reactStrictMode,
    'process.env.__NEXT_OPTIMIZE_CSS':
      (config.experimental.optimizeCss && !dev) ?? false,
    'process.env.__NEXT_SCRIPT_WORKERS':
      (config.experimental.nextScriptWorkers && !dev) ?? false,
    'process.env.__NEXT_SCROLL_RESTORATION':
      config.experimental.scrollRestoration ?? false,
    ...getImageConfig(config, dev),
    'process.env.__NEXT_ROUTER_BASEPATH': config.basePath,
    'process.env.__NEXT_STRICT_NEXT_HEAD':
      config.experimental.strictNextHead ?? true,
    'process.env.__NEXT_HAS_REWRITES': hasRewrites,
    'process.env.__NEXT_CONFIG_OUTPUT': config.output,
    'process.env.__NEXT_I18N_SUPPORT': !!config.i18n,
    'process.env.__NEXT_I18N_DOMAINS': config.i18n?.domains ?? false,
    'process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE':
      config.skipMiddlewareUrlNormalize,
    'process.env.__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE':
      config.experimental.externalMiddlewareRewritesResolve ?? false,
    'process.env.__NEXT_MANUAL_TRAILING_SLASH':
      config.skipTrailingSlashRedirect,
    'process.env.__NEXT_HAS_WEB_VITALS_ATTRIBUTION':
      (config.experimental.webVitalsAttribution &&
        config.experimental.webVitalsAttribution.length > 0) ??
      false,
    'process.env.__NEXT_WEB_VITALS_ATTRIBUTION':
      config.experimental.webVitalsAttribution ?? false,
    'process.env.__NEXT_LINK_NO_TOUCH_START':
      config.experimental.linkNoTouchStart ?? false,
    'process.env.__NEXT_ASSET_PREFIX': config.assetPrefix,
    'process.env.__NEXT_DISABLE_SYNC_DYNAMIC_API_WARNINGS':
      // Internal only so untyped to avoid discovery
      (config.experimental as any).internal_disableSyncDynamicAPIWarnings ??
      false,
    'process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS':
      !!config.experimental.authInterrupts,
    ...(isNodeOrEdgeCompilation
      ? {
          // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
          // This is typically found in unmaintained modules from the
          // pre-webpack era (common in server-side code)
          'global.GENTLY': false,
        }
      : undefined),
    ...(isNodeOrEdgeCompilation
      ? {
          'process.env.__NEXT_EXPERIMENTAL_REACT':
            needsExperimentalReact(config),
        }
      : undefined),
    'process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY':
      config.experimental.newDevOverlay ?? false,
  }

  const userDefines = config.compiler?.define ?? {}
  for (const key in userDefines) {
    if (defineEnv.hasOwnProperty(key)) {
      throw new Error(
        `The \`compiler.define\` option is configured to replace the \`${key}\` variable. This variable is either part of a Next.js built-in or is already configured via the \`env\` option.`
      )
    }
    defineEnv[key] = userDefines[key]
  }

  return serializeDefineEnv(defineEnv)
}

export function getDefineEnvPlugin(options: DefineEnvPluginOptions) {
  return new webpack.DefinePlugin(getDefineEnv(options))
}
