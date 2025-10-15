import type {
  I18NConfig,
  I18NDomains,
  NextConfigComplete,
} from '../server/config-shared'
import type { ProxyMatcher } from './analysis/get-page-static-info'
import type { Rewrite } from '../lib/load-custom-routes'
import path from 'node:path'
import { needsExperimentalReact } from '../lib/needs-experimental-react'
import { checkIsAppPPREnabled } from '../server/lib/experimental/ppr'
import {
  getNextConfigEnv,
  getNextPublicEnvironmentVariables,
} from '../lib/static-env'

type BloomFilter = ReturnType<
  import('../shared/lib/bloom-filter').BloomFilter['export']
>

export interface DefineEnvOptions {
  isTurbopack: boolean
  clientRouterFilters?: {
    staticFilter: BloomFilter
    dynamicFilter: BloomFilter
  }
  config: NextConfigComplete
  dev: boolean
  distDir: string
  projectPath: string
  fetchCacheKeyPrefix: string | undefined
  hasRewrites: boolean
  isClient: boolean
  isEdgeServer: boolean
  isNodeServer: boolean
  middlewareMatchers: ProxyMatcher[] | undefined
  omitNonDeterministic?: boolean
  rewrites: {
    beforeFiles: Rewrite[]
    afterFiles: Rewrite[]
    fallback: Rewrite[]
  }
}

interface DefineEnv {
  [key: string]:
    | string
    | string[]
    | boolean
    | ProxyMatcher[]
    | BloomFilter
    | Partial<NextConfigComplete['images']>
    | I18NDomains
    | I18NConfig
}

interface SerializedDefineEnv {
  [key: string]: string
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
      qualities: config.images.qualities,
      path: config.images.path,
      loader: config.images.loader,
      dangerouslyAllowSVG: config.images.dangerouslyAllowSVG,
      unoptimized: config?.images?.unoptimized,
      ...(dev
        ? {
            // additional config in dev to allow validating on the client
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
  projectPath,
  fetchCacheKeyPrefix,
  hasRewrites,
  isClient,
  isEdgeServer,
  isNodeServer,
  middlewareMatchers,
  omitNonDeterministic,
  rewrites,
}: DefineEnvOptions): SerializedDefineEnv {
  const nextPublicEnv = getNextPublicEnvironmentVariables()
  const nextConfigEnv = getNextConfigEnv(config)

  const isPPREnabled = checkIsAppPPREnabled(config.experimental.ppr)
  const isCacheComponentsEnabled = !!config.cacheComponents
  const isUseCacheEnabled = !!config.experimental.useCache

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
    'process.env.__NEXT_BUNDLER': isTurbopack
      ? 'Turbopack'
      : process.env.NEXT_RSPACK
        ? 'Rspack'
        : 'Webpack',
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
    'process.env.__NEXT_PPR': isPPREnabled,
    'process.env.__NEXT_CACHE_COMPONENTS': isCacheComponentsEnabled,
    'process.env.__NEXT_USE_CACHE': isUseCacheEnabled,

    'process.env.NEXT_DEPLOYMENT_ID': config.experimental?.useSkewCookie
      ? false
      : config.deploymentId || false,
    // Propagates the `__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING` environment
    // variable to the client.
    'process.env.__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING':
      process.env.__NEXT_EXPERIMENTAL_STATIC_SHELL_DEBUGGING || false,
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
    'process.env.__NEXT_CLIENT_VALIDATE_RSC_REQUEST_HEADERS': Boolean(
      config.experimental.validateRSCRequestHeaders
    ),
    'process.env.__NEXT_DYNAMIC_ON_HOVER': Boolean(
      config.experimental.dynamicOnHover
    ),
    'process.env.__NEXT_OPTIMISTIC_CLIENT_CACHE':
      config.experimental.optimisticClientCache ?? true,
    'process.env.__NEXT_MIDDLEWARE_PREFETCH':
      config.experimental.proxyPrefetch ?? 'flexible',
    'process.env.__NEXT_CROSS_ORIGIN': config.crossOrigin,
    'process.browser': isClient,
    'process.env.__NEXT_TEST_MODE': process.env.__NEXT_TEST_MODE ?? false,
    // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
    ...(dev && (isClient ?? isEdgeServer)
      ? {
          'process.env.__NEXT_DIST_DIR': distDir,
        }
      : {}),
    // This is used in devtools to strip the project path in edge runtime,
    // as there's only a dummy `dir` value (`.`) as edge runtime doesn't have concept of file system.
    ...(dev && isEdgeServer
      ? {
          'process.env.__NEXT_EDGE_PROJECT_DIR': isTurbopack
            ? path.relative(process.cwd(), projectPath)
            : projectPath,
        }
      : {}),
    'process.env.__NEXT_BASE_PATH': config.basePath,
    'process.env.__NEXT_CASE_SENSITIVE_ROUTES': Boolean(
      config.experimental.caseSensitiveRoutes
    ),
    'process.env.__NEXT_REWRITES': rewrites as any,
    'process.env.__NEXT_TRAILING_SLASH': config.trailingSlash,
    'process.env.__NEXT_DEV_INDICATOR': config.devIndicators !== false,
    'process.env.__NEXT_DEV_INDICATOR_POSITION':
      config.devIndicators === false
        ? 'bottom-left' // This will not be used as the indicator is disabled.
        : (config.devIndicators.position ?? 'bottom-left'),
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
    'process.env.__NEXT_HAS_REWRITES': hasRewrites,
    'process.env.__NEXT_CONFIG_OUTPUT': config.output,
    'process.env.__NEXT_I18N_SUPPORT': !!config.i18n,
    'process.env.__NEXT_I18N_DOMAINS': config.i18n?.domains ?? false,
    'process.env.__NEXT_I18N_CONFIG': config.i18n || '',
    'process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE':
      config.skipProxyUrlNormalize,
    'process.env.__NEXT_EXTERNAL_MIDDLEWARE_REWRITE_RESOLVE':
      config.experimental.externalProxyRewritesResolve ?? false,
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
    'process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS':
      !!config.experimental.authInterrupts,
    'process.env.__NEXT_TELEMETRY_DISABLED': Boolean(
      process.env.NEXT_TELEMETRY_DISABLED
    ),
    ...(isNodeServer || isEdgeServer
      ? {
          // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
          // This is typically found in unmaintained modules from the
          // pre-webpack era (common in server-side code)
          'global.GENTLY': false,
        }
      : undefined),
    ...(isNodeServer || isEdgeServer
      ? {
          'process.env.__NEXT_EXPERIMENTAL_REACT':
            needsExperimentalReact(config),
        }
      : undefined),

    'process.env.__NEXT_MULTI_ZONE_DRAFT_MODE':
      config.experimental.multiZoneDraftMode ?? false,
    'process.env.__NEXT_TRUST_HOST_HEADER':
      config.experimental.trustHostHeader ?? false,
    'process.env.__NEXT_ALLOWED_REVALIDATE_HEADERS':
      config.experimental.allowedRevalidateHeaderKeys ?? [],
    ...(isNodeServer
      ? {
          'process.env.__NEXT_RELATIVE_DIST_DIR': config.distDir,
          'process.env.__NEXT_RELATIVE_PROJECT_DIR': path.relative(
            process.cwd(),
            projectPath
          ),
        }
      : {}),

    'process.env.__NEXT_BROWSER_DEBUG_INFO_IN_TERMINAL': JSON.stringify(
      config.experimental.browserDebugInfoInTerminal || false
    ),
    'process.env.__NEXT_MCP_SERVER': !!config.experimental.mcpServer,

    // The devtools need to know whether or not to show an option to clear the
    // bundler cache. This option may be removed later once Turbopack's
    // filesystem cache feature is more stable.
    //
    // This environment value is currently best-effort:
    // - It's possible to disable the webpack filesystem cache, but it's
    //   unlikely for a user to do that.
    // - Rspack's filesystem cache is unstable and requires a different
    //   configuration than webpack to enable (which we don't do).
    //
    // In the worst case we'll show an option to clear the cache, but it'll be a
    // no-op that just restarts the development server.
    'process.env.__NEXT_BUNDLER_HAS_PERSISTENT_CACHE':
      !isTurbopack ||
      (config.experimental.turbopackFileSystemCacheForDev ?? false),
    'process.env.__NEXT_REACT_DEBUG_CHANNEL':
      config.experimental.reactDebugChannel ?? false,
  }

  const userDefines = config.compiler?.define ?? {}
  for (const key in userDefines) {
    if (defineEnv.hasOwnProperty(key)) {
      throw new Error(
        `The \`compiler.define\` option is configured to replace the \`${key}\` variable. This variable is either part of a Next.js built-in or is already configured.`
      )
    }
    defineEnv[key] = userDefines[key]
  }

  if (isNodeServer || isEdgeServer) {
    const userDefinesServer = config.compiler?.defineServer ?? {}
    for (const key in userDefinesServer) {
      if (defineEnv.hasOwnProperty(key)) {
        throw new Error(
          `The \`compiler.defineServer\` option is configured to replace the \`${key}\` variable. This variable is either part of a Next.js built-in or is already configured.`
        )
      }
      defineEnv[key] = userDefinesServer[key]
    }
  }

  const serializedDefineEnv = serializeDefineEnv(defineEnv)

  // we delay inlining these values until after the build
  // with flying shuttle enabled so we can update them
  // without invalidating entries
  if (!dev && omitNonDeterministic) {
    // client uses window. instead of leaving process.env
    // in case process isn't polyfilled on client already
    // since by this point it won't be added by webpack
    const safeKey = (key: string) =>
      isClient ? `window.${key.split('.').pop()}` : key

    for (const key in nextPublicEnv) {
      serializedDefineEnv[key] = safeKey(key)
    }
    for (const key in nextConfigEnv) {
      serializedDefineEnv[key] = safeKey(key)
    }
    for (const key of ['process.env.NEXT_DEPLOYMENT_ID']) {
      serializedDefineEnv[key] = safeKey(key)
    }
  }

  return serializedDefineEnv
}
