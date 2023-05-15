import React from 'react'
import ReactRefreshWebpackPlugin from 'next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin'
import chalk from 'next/dist/compiled/chalk'
import crypto from 'crypto'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'
import {
  DOT_NEXT_ALIAS,
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
  APP_DIR_ALIAS,
  WEBPACK_LAYERS,
  RSC_ACTION_PROXY_ALIAS,
  RSC_ACTION_CLIENT_WRAPPER_ALIAS,
  RSC_ACTION_VALIDATE_ALIAS,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { CustomRoutes } from '../lib/load-custom-routes.js'
import { isEdgeRuntime } from '../lib/is-edge-runtime'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_MAIN_APP,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVER_DIRECTORY,
  COMPILER_NAMES,
  CompilerNameValues,
} from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import { NextConfigComplete } from '../server/config-shared'
import { finalizeEntrypoint } from './entries'
import * as Log from './output/log'
import { buildConfiguration } from './webpack/config'
import MiddlewarePlugin, {
  getEdgePolyfilledModules,
  handleWebpackExternalForEdgeRuntime,
} from './webpack/plugins/middleware-plugin'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { WellKnownErrorsPlugin } from './webpack/plugins/wellknown-errors-plugin'
import { regexLikeCss } from './webpack/config/blocks/css'
import { CopyFilePlugin } from './webpack/plugins/copy-file-plugin'
import { ClientReferenceManifestPlugin } from './webpack/plugins/flight-manifest-plugin'
import { ClientReferenceEntryPlugin } from './webpack/plugins/flight-client-entry-plugin'
import { NextTypesPlugin } from './webpack/plugins/next-types-plugin'
import type {
  Feature,
  SWC_TARGET_TRIPLE,
} from './webpack/plugins/telemetry-plugin'
import type { Span } from '../trace'
import type { MiddlewareMatcher } from './analysis/get-page-static-info'
import loadJsConfig from './load-jsconfig'
import { loadBindings } from './swc'
import { AppBuildManifestPlugin } from './webpack/plugins/app-build-manifest-plugin'
import { SubresourceIntegrityPlugin } from './webpack/plugins/subresource-integrity-plugin'
import { NextFontManifestPlugin } from './webpack/plugins/next-font-manifest-plugin'
import { getSupportedBrowsers } from './utils'
import { METADATA_RESOURCE_QUERY } from './webpack/loaders/metadata/discover'

const EXTERNAL_PACKAGES =
  require('../lib/server-external-packages.json') as string[]

const NEXT_PROJECT_ROOT = path.join(__dirname, '..', '..')
const NEXT_PROJECT_ROOT_DIST = path.join(NEXT_PROJECT_ROOT, 'dist')
const NEXT_PROJECT_ROOT_DIST_CLIENT = path.join(
  NEXT_PROJECT_ROOT_DIST,
  'client'
)

if (parseInt(React.version) < 18) {
  throw new Error('Next.js requires react >= 18.2.0 to be installed.')
}

const babelIncludeRegexes: RegExp[] = [
  /next[\\/]dist[\\/](esm[\\/])?shared[\\/]lib/,
  /next[\\/]dist[\\/](esm[\\/])?client/,
  /next[\\/]dist[\\/](esm[\\/])?pages/,
  /[\\/](strip-ansi|ansi-regex|styled-jsx)[\\/]/,
]

const reactPackagesRegex = /^(react|react-dom|react-server-dom-webpack)($|\/)/

const asyncStoragesRegex =
  /next[\\/]dist[\\/]client[\\/]components[\\/](static-generation-async-storage|action-async-storage|request-async-storage)/

const mainFieldsPerCompiler: Record<CompilerNameValues, string[]> = {
  [COMPILER_NAMES.server]: ['main', 'module'],
  [COMPILER_NAMES.client]: ['browser', 'module', 'main'],
  [COMPILER_NAMES.edgeServer]: [
    'edge-light',
    'worker',
    'browser',
    'module',
    'main',
  ],
}

const BABEL_CONFIG_FILES = [
  '.babelrc',
  '.babelrc.json',
  '.babelrc.js',
  '.babelrc.mjs',
  '.babelrc.cjs',
  'babel.config.js',
  'babel.config.json',
  'babel.config.mjs',
  'babel.config.cjs',
]

export const getBabelConfigFile = async (dir: string) => {
  const babelConfigFile = await BABEL_CONFIG_FILES.reduce(
    async (memo: Promise<string | undefined>, filename) => {
      const configFilePath = path.join(dir, filename)
      return (
        (await memo) ||
        ((await fileExists(configFilePath)) ? configFilePath : undefined)
      )
    },
    Promise.resolve(undefined)
  )
  return babelConfigFile
}

// Support for NODE_PATH
const nodePathList = (process.env.NODE_PATH || '')
  .split(process.platform === 'win32' ? ';' : ':')
  .filter((p) => !!p)

const watchOptions = Object.freeze({
  aggregateTimeout: 5,
  ignored: ['**/.git/**', '**/.next/**'],
})

function isModuleCSS(module: { type: string }) {
  return (
    // mini-css-extract-plugin
    module.type === `css/mini-extract` ||
    // extract-css-chunks-webpack-plugin (old)
    module.type === `css/extract-chunks` ||
    // extract-css-chunks-webpack-plugin (new)
    module.type === `css/extract-css-chunks`
  )
}

function errorIfEnvConflicted(config: NextConfigComplete, key: string) {
  const isPrivateKey = /^(?:NODE_.+)|^(?:__.+)$/i.test(key)
  const hasNextRuntimeKey = key === 'NEXT_RUNTIME'

  if (isPrivateKey || hasNextRuntimeKey) {
    throw new Error(
      `The key "${key}" under "env" in ${config.configFileName} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
    )
  }
}

function isResourceInPackages(
  resource: string,
  packageNames?: string[],
  packageDirMapping?: Map<string, string>
) {
  return packageNames?.some((p: string) =>
    packageDirMapping && packageDirMapping.has(p)
      ? resource.startsWith(packageDirMapping.get(p)! + path.sep)
      : resource.includes(
          path.sep +
            path.join('node_modules', p.replace(/\//g, path.sep)) +
            path.sep
        )
  )
}

export function getDefineEnv({
  dev,
  config,
  distDir,
  isClient,
  hasRewrites,
  isNodeServer,
  isEdgeServer,
  middlewareMatchers,
  clientRouterFilters,
  previewModeId,
  fetchCacheKeyPrefix,
  allowedRevalidateHeaderKeys,
}: {
  dev?: boolean
  distDir: string
  isClient?: boolean
  hasRewrites?: boolean
  isNodeServer?: boolean
  isEdgeServer?: boolean
  middlewareMatchers?: MiddlewareMatcher[]
  config: NextConfigComplete
  clientRouterFilters: Parameters<
    typeof getBaseWebpackConfig
  >[1]['clientRouterFilters']
  previewModeId?: string
  fetchCacheKeyPrefix?: string
  allowedRevalidateHeaderKeys?: string[]
}) {
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
    // TODO: enforce `NODE_ENV` on `process.env`, and add a test:
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    'process.env.NEXT_RUNTIME': JSON.stringify(
      isEdgeServer ? 'edge' : isNodeServer ? 'nodejs' : undefined
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
    'process.env.__NEXT_NEW_LINK_BEHAVIOR': JSON.stringify(
      config.experimental.newNextLinkBehavior
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
      // When next.config.js does not have reactStrictMode enabling appDir will enable it.
      config.reactStrictMode === null
        ? config.experimental.appDir
          ? true
          : false
        : config.reactStrictMode
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
    'process.env.__NEXT_ANALYTICS_ID': JSON.stringify(config.analyticsId),
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
    ...(isNodeServer || isEdgeServer
      ? {
          // Fix bad-actors in the npm ecosystem (e.g. `node-formidable`)
          // This is typically found in unmaintained modules from the
          // pre-webpack era (common in server-side code)
          'global.GENTLY': JSON.stringify(false),
        }
      : undefined),
    // stub process.env with proxy to warn a missing value is
    // being accessed in development mode
    ...(config.experimental.pageEnv && dev
      ? {
          'process.env': `
            new Proxy(${isNodeServer ? 'process.env' : '{}'}, {
              get(target, prop) {
                if (typeof target[prop] === 'undefined') {
                  console.warn(\`An environment variable (\${prop}) that was not provided in the environment was accessed.\nSee more info here: https://nextjs.org/docs/messages/missing-env-value\`)
                }
                return target[prop]
              }
            })
          `,
        }
      : {}),
  }
}

type ExcludesFalse = <T>(x: T | false) => x is T

const devtoolRevertWarning = execOnce(
  (devtool: webpack.Configuration['devtool']) => {
    console.warn(
      chalk.yellow.bold('Warning: ') +
        chalk.bold(`Reverting webpack devtool to '${devtool}'.\n`) +
        'Changing the webpack devtool in development mode will cause severe performance regressions.\n' +
        'Read more: https://nextjs.org/docs/messages/improper-devtool'
    )
  }
)

let loggedSwcDisabled = false
let loggedIgnoredCompilerOptions = false

function getOptimizedAliases(): { [pkg: string]: string } {
  const stubWindowFetch = path.join(__dirname, 'polyfills', 'fetch', 'index.js')
  const stubObjectAssign = path.join(__dirname, 'polyfills', 'object-assign.js')

  const shimAssign = path.join(__dirname, 'polyfills', 'object.assign')
  return Object.assign(
    {},
    {
      unfetch$: stubWindowFetch,
      'isomorphic-unfetch$': stubWindowFetch,
      'whatwg-fetch$': path.join(
        __dirname,
        'polyfills',
        'fetch',
        'whatwg-fetch.js'
      ),
    },
    {
      'object-assign$': stubObjectAssign,

      // Stub Package: object.assign
      'object.assign/auto': path.join(shimAssign, 'auto.js'),
      'object.assign/implementation': path.join(
        shimAssign,
        'implementation.js'
      ),
      'object.assign$': path.join(shimAssign, 'index.js'),
      'object.assign/polyfill': path.join(shimAssign, 'polyfill.js'),
      'object.assign/shim': path.join(shimAssign, 'shim.js'),

      // Replace: full URL polyfill with platform-based polyfill
      url: require.resolve('next/dist/compiled/native-url'),
    }
  )
}

type ClientEntries = {
  [key: string]: string | string[]
}

export function attachReactRefresh(
  webpackConfig: webpack.Configuration,
  targetLoader: webpack.RuleSetUseItem
) {
  let injections = 0
  const reactRefreshLoaderName =
    'next/dist/compiled/@next/react-refresh-utils/dist/loader'
  const reactRefreshLoader = require.resolve(reactRefreshLoaderName)
  webpackConfig.module?.rules?.forEach((rule) => {
    if (rule && typeof rule === 'object' && 'use' in rule) {
      const curr = rule.use
      // When the user has configured `defaultLoaders.babel` for a input file:
      if (curr === targetLoader) {
        ++injections
        rule.use = [reactRefreshLoader, curr as webpack.RuleSetUseItem]
      } else if (
        Array.isArray(curr) &&
        curr.some((r) => r === targetLoader) &&
        // Check if loader already exists:
        !curr.some(
          (r) => r === reactRefreshLoader || r === reactRefreshLoaderName
        )
      ) {
        ++injections
        const idx = curr.findIndex((r) => r === targetLoader)
        // Clone to not mutate user input
        rule.use = [...curr]

        // inject / input: [other, babel] output: [other, refresh, babel]:
        rule.use.splice(idx, 0, reactRefreshLoader)
      }
    }
  })

  if (injections) {
    Log.info(
      `automatically enabled Fast Refresh for ${injections} custom loader${
        injections > 1 ? 's' : ''
      }`
    )
  }
}

export const NODE_RESOLVE_OPTIONS = {
  dependencyType: 'commonjs',
  modules: ['node_modules'],
  fallback: false,
  exportsFields: ['exports'],
  importsFields: ['imports'],
  conditionNames: ['node', 'require'],
  descriptionFiles: ['package.json'],
  extensions: ['.js', '.json', '.node'],
  enforceExtensions: false,
  symlinks: true,
  mainFields: ['main'],
  mainFiles: ['index'],
  roots: [],
  fullySpecified: false,
  preferRelative: false,
  preferAbsolute: false,
  restrictions: [],
}

export const NODE_BASE_RESOLVE_OPTIONS = {
  ...NODE_RESOLVE_OPTIONS,
  alias: false,
}

export const NODE_ESM_RESOLVE_OPTIONS = {
  ...NODE_RESOLVE_OPTIONS,
  alias: false,
  dependencyType: 'esm',
  conditionNames: ['node', 'import'],
  fullySpecified: true,
}

export const NODE_BASE_ESM_RESOLVE_OPTIONS = {
  ...NODE_ESM_RESOLVE_OPTIONS,
  alias: false,
}

export const nextImageLoaderRegex =
  /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i

export async function resolveExternal(
  dir: string,
  esmExternalsConfig: NextConfigComplete['experimental']['esmExternals'],
  context: string,
  request: string,
  isEsmRequested: boolean,
  hasAppDir: boolean,
  getResolve: (
    options: any
  ) => (
    resolveContext: string,
    resolveRequest: string
  ) => Promise<[string | null, boolean]>,
  isLocalCallback?: (res: string) => any,
  baseResolveCheck = true,
  esmResolveOptions: any = NODE_ESM_RESOLVE_OPTIONS,
  nodeResolveOptions: any = NODE_RESOLVE_OPTIONS,
  baseEsmResolveOptions: any = NODE_BASE_ESM_RESOLVE_OPTIONS,
  baseResolveOptions: any = NODE_BASE_RESOLVE_OPTIONS
) {
  const esmExternals = !!esmExternalsConfig
  const looseEsmExternals = esmExternalsConfig === 'loose'

  let res: string | null = null
  let isEsm: boolean = false

  let preferEsmOptions =
    esmExternals && isEsmRequested ? [true, false] : [false]
  // Disable esm resolving for app/ and pages/ so for esm package using under pages/
  // won't load react through esm loader
  if (hasAppDir) {
    preferEsmOptions = [false]
  }
  for (const preferEsm of preferEsmOptions) {
    const resolve = getResolve(
      preferEsm ? esmResolveOptions : nodeResolveOptions
    )

    // Resolve the import with the webpack provided context, this
    // ensures we're resolving the correct version when multiple
    // exist.
    try {
      ;[res, isEsm] = await resolve(context, request)
    } catch (err) {
      res = null
    }

    if (!res) {
      continue
    }

    // ESM externals can only be imported (and not required).
    // Make an exception in loose mode.
    if (!isEsmRequested && isEsm && !looseEsmExternals) {
      continue
    }

    if (isLocalCallback) {
      return { localRes: isLocalCallback(res) }
    }

    // Bundled Node.js code is relocated without its node_modules tree.
    // This means we need to make sure its request resolves to the same
    // package that'll be available at runtime. If it's not identical,
    // we need to bundle the code (even if it _should_ be external).
    if (baseResolveCheck) {
      let baseRes: string | null
      let baseIsEsm: boolean
      try {
        const baseResolve = getResolve(
          isEsm ? baseEsmResolveOptions : baseResolveOptions
        )
        ;[baseRes, baseIsEsm] = await baseResolve(dir, request)
      } catch (err) {
        baseRes = null
        baseIsEsm = false
      }

      // Same as above: if the package, when required from the root,
      // would be different from what the real resolution would use, we
      // cannot externalize it.
      // if request is pointing to a symlink it could point to the the same file,
      // the resolver will resolve symlinks so this is handled
      if (baseRes !== res || isEsm !== baseIsEsm) {
        res = null
        continue
      }
    }
    break
  }
  return { res, isEsm }
}

export async function loadProjectInfo({
  dir,
  config,
  dev,
}: {
  dir: string
  config: NextConfigComplete
  dev: boolean
}) {
  const { jsConfig, resolvedBaseUrl } = await loadJsConfig(dir, config)
  const supportedBrowsers = await getSupportedBrowsers(dir, dev, config)
  return {
    jsConfig,
    resolvedBaseUrl,
    supportedBrowsers,
  }
}

export default async function getBaseWebpackConfig(
  dir: string,
  {
    buildId,
    config,
    compilerType,
    dev = false,
    entrypoints,
    isDevFallback = false,
    pagesDir,
    reactProductionProfiling = false,
    rewrites,
    originalRewrites,
    originalRedirects,
    runWebpackSpan,
    appDir,
    middlewareMatchers,
    noMangling = false,
    jsConfig,
    resolvedBaseUrl,
    supportedBrowsers,
    clientRouterFilters,
    previewModeId,
    fetchCacheKeyPrefix,
    allowedRevalidateHeaderKeys,
  }: {
    buildId: string
    config: NextConfigComplete
    compilerType: CompilerNameValues
    dev?: boolean
    entrypoints: webpack.EntryObject
    isDevFallback?: boolean
    pagesDir?: string
    reactProductionProfiling?: boolean
    rewrites: CustomRoutes['rewrites']
    originalRewrites: CustomRoutes['rewrites'] | undefined
    originalRedirects: CustomRoutes['redirects'] | undefined
    runWebpackSpan: Span
    appDir?: string
    middlewareMatchers?: MiddlewareMatcher[]
    noMangling?: boolean
    jsConfig: any
    resolvedBaseUrl: string | undefined
    supportedBrowsers: string[] | undefined
    clientRouterFilters?: {
      staticFilter: ReturnType<
        import('../shared/lib/bloom-filter').BloomFilter['export']
      >
      dynamicFilter: ReturnType<
        import('../shared/lib/bloom-filter').BloomFilter['export']
      >
    }
    previewModeId?: string
    fetchCacheKeyPrefix?: string
    allowedRevalidateHeaderKeys?: string[]
  }
): Promise<webpack.Configuration> {
  const isClient = compilerType === COMPILER_NAMES.client
  const isEdgeServer = compilerType === COMPILER_NAMES.edgeServer
  const isNodeServer = compilerType === COMPILER_NAMES.server

  const hasRewrites =
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0

  const hasAppDir = !!config.experimental.appDir && !!appDir
  const hasServerComponents = hasAppDir
  const disableOptimizedLoading = true
  const enableTypedRoutes = !!config.experimental.typedRoutes && hasAppDir
  const serverActions = !!config.experimental.serverActions && hasAppDir
  const bundledReactChannel = serverActions ? '-experimental' : ''

  if (isClient) {
    if (
      // @ts-expect-error: experimental.runtime is deprecated
      isEdgeRuntime(config.experimental.runtime)
    ) {
      Log.warn(
        'You are using `experimental.runtime` which was removed. Check https://nextjs.org/docs/api-routes/edge-api-routes on how to use edge runtime.'
      )
    }
  }

  const babelConfigFile = await getBabelConfigFile(dir)
  const distDir = path.join(dir, config.distDir)

  let useSWCLoader = !babelConfigFile || config.experimental.forceSwcTransforms
  let SWCBinaryTarget: [Feature, boolean] | undefined = undefined
  if (useSWCLoader) {
    // TODO: we do not collect wasm target yet
    const binaryTarget = require('./swc')?.getBinaryMetadata?.()
      ?.target as SWC_TARGET_TRIPLE
    SWCBinaryTarget = binaryTarget
      ? [`swc/target/${binaryTarget}` as const, true]
      : undefined
  }

  if (!loggedSwcDisabled && !useSWCLoader && babelConfigFile) {
    Log.info(
      `Disabled SWC as replacement for Babel because of custom Babel configuration "${path.relative(
        dir,
        babelConfigFile
      )}" https://nextjs.org/docs/messages/swc-disabled`
    )
    loggedSwcDisabled = true
  }

  // eagerly load swc bindings instead of waiting for transform calls
  if (!babelConfigFile && isClient) {
    await loadBindings()
  }

  if (!loggedIgnoredCompilerOptions && !useSWCLoader && config.compiler) {
    Log.info(
      '`compiler` options in `next.config.js` will be ignored while using Babel https://nextjs.org/docs/messages/ignored-compiler-options'
    )
    loggedIgnoredCompilerOptions = true
  }

  const getBabelLoader = () => {
    return {
      loader: require.resolve('./babel/loader/index'),
      options: {
        configFile: babelConfigFile,
        isServer: isNodeServer || isEdgeServer,
        distDir,
        pagesDir,
        cwd: dir,
        development: dev,
        hasServerComponents,
        hasReactRefresh: dev && isClient,
        hasJsxRuntime: true,
      },
    }
  }

  let swcTraceProfilingInitialized = false
  const getSwcLoader = (extraOptions?: any) => {
    if (
      config?.experimental?.swcTraceProfiling &&
      !swcTraceProfilingInitialized
    ) {
      // This will init subscribers once only in a single process lifecycle,
      // even though it can be called multiple times.
      // Subscriber need to be initialized _before_ any actual swc's call (transform, etcs)
      // to collect correct trace spans when they are called.
      swcTraceProfilingInitialized = true
      require('./swc')?.initCustomTraceSubscriber?.(
        path.join(distDir, `swc-trace-profile-${Date.now()}.json`)
      )
    }

    return {
      loader: 'next-swc-loader',
      options: {
        isServer: isNodeServer || isEdgeServer,
        rootDir: dir,
        pagesDir,
        appDir,
        hasServerComponents,
        hasReactRefresh: dev && isClient,
        fileReading: config.experimental.swcFileReading,
        nextConfig: config,
        jsConfig,
        supportedBrowsers,
        swcCacheDir: path.join(dir, config?.distDir ?? '.next', 'cache', 'swc'),
        ...extraOptions,
      },
    }
  }

  const defaultLoaders = {
    babel: useSWCLoader ? getSwcLoader() : getBabelLoader(),
  }

  const swcLoaderForServerLayer = hasServerComponents
    ? useSWCLoader
      ? [getSwcLoader({ isServerLayer: true })]
      : // When using Babel, we will have to add the SWC loader
        // as an additional pass to handle RSC correctly.
        // This will cause some performance overhead but
        // acceptable as Babel will not be recommended.
        [getSwcLoader({ isServerLayer: true }), getBabelLoader()]
    : []
  const swcLoaderForClientLayer = hasServerComponents
    ? useSWCLoader
      ? [getSwcLoader({ isServerLayer: false })]
      : // When using Babel, we will have to add the SWC loader
        // as an additional pass to handle RSC correctly.
        // This will cause some performance overhead but
        // acceptable as Babel will not be recommended.
        [getSwcLoader({ isServerLayer: false }), getBabelLoader()]
    : []

  // Loader for API routes needs to be differently configured as it shouldn't
  // have RSC transpiler enabled, so syntax checks such as invalid imports won't
  // be performed.
  const loaderForAPIRoutes =
    hasServerComponents && useSWCLoader
      ? {
          loader: 'next-swc-loader',
          options: {
            ...getSwcLoader().options,
            hasServerComponents: false,
          },
        }
      : defaultLoaders.babel

  const pageExtensions = config.pageExtensions

  const outputPath =
    isNodeServer || isEdgeServer
      ? path.join(distDir, SERVER_DIRECTORY)
      : distDir

  const reactServerCondition = [
    'react-server',
    ...mainFieldsPerCompiler[
      isEdgeServer ? COMPILER_NAMES.edgeServer : COMPILER_NAMES.server
    ],
    'node',
    'import',
    'require',
  ]

  const clientEntries = isClient
    ? ({
        // Backwards compatibility
        'main.js': [],
        ...(dev
          ? {
              [CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH]: require.resolve(
                `next/dist/compiled/@next/react-refresh-utils/dist/runtime`
              ),
              [CLIENT_STATIC_FILES_RUNTIME_AMP]:
                `./` +
                path
                  .relative(
                    dir,
                    path.join(NEXT_PROJECT_ROOT_DIST_CLIENT, 'dev', 'amp-dev')
                  )
                  .replace(/\\/g, '/'),
            }
          : {}),
        [CLIENT_STATIC_FILES_RUNTIME_MAIN]:
          `./` +
          path
            .relative(
              dir,
              path.join(
                NEXT_PROJECT_ROOT_DIST_CLIENT,
                dev ? `next-dev.js` : 'next.js'
              )
            )
            .replace(/\\/g, '/'),
        ...(hasAppDir
          ? {
              [CLIENT_STATIC_FILES_RUNTIME_MAIN_APP]: dev
                ? [
                    require.resolve(
                      `next/dist/compiled/@next/react-refresh-utils/dist/runtime`
                    ),
                    `./` +
                      path
                        .relative(
                          dir,
                          path.join(
                            NEXT_PROJECT_ROOT_DIST_CLIENT,
                            'app-next-dev.js'
                          )
                        )
                        .replace(/\\/g, '/'),
                  ]
                : [
                    `./` +
                      path
                        .relative(
                          dir,
                          path.join(
                            NEXT_PROJECT_ROOT_DIST_CLIENT,
                            'app-next.js'
                          )
                        )
                        .replace(/\\/g, '/'),
                  ],
            }
          : {}),
      } as ClientEntries)
    : undefined

  function getReactProfilingInProduction() {
    if (reactProductionProfiling) {
      return {
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
      }
    }
  }

  // tell webpack where to look for _app and _document
  // using aliases to allow falling back to the default
  // version when removed or not present
  const clientResolveRewrites = require.resolve(
    '../shared/lib/router/utils/resolve-rewrites'
  )

  const customAppAliases: { [key: string]: string[] } = {}
  const customErrorAlias: { [key: string]: string[] } = {}
  const customDocumentAliases: { [key: string]: string[] } = {}
  const customRootAliases: { [key: string]: string[] } = {}

  if (dev) {
    const nextDist = 'next/dist/' + (isEdgeServer ? 'esm/' : '')
    customAppAliases[`${PAGES_DIR_ALIAS}/_app`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_app.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDist}pages/_app.js`,
    ]
    customAppAliases[`${PAGES_DIR_ALIAS}/_error`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_error.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDist}pages/_error.js`,
    ]
    customDocumentAliases[`${PAGES_DIR_ALIAS}/_document`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_document.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDist}pages/_document.js`,
    ]
  }

  let hasExternalOtelApiPackage = false
  try {
    require.resolve('@opentelemetry/api')
    hasExternalOtelApiPackage = true
  } catch {}

  const resolveConfig: webpack.Configuration['resolve'] = {
    // Disable .mjs for node_modules bundling
    extensions: isNodeServer
      ? ['.js', '.mjs', '.tsx', '.ts', '.jsx', '.json', '.wasm']
      : ['.mjs', '.js', '.tsx', '.ts', '.jsx', '.json', '.wasm'],
    extensionAlias: config.experimental.extensionAlias,
    modules: [
      'node_modules',
      ...nodePathList, // Support for NODE_PATH environment variable
    ],
    alias: {
      // Alias next/dist imports to next/dist/esm assets,
      // let this alias hit before `next` alias.
      ...(isEdgeServer
        ? {
            'next/dist/client': 'next/dist/esm/client',
            'next/dist/shared': 'next/dist/esm/shared',
            'next/dist/pages': 'next/dist/esm/pages',
            'next/dist/lib': 'next/dist/esm/lib',

            // Alias the usage of next public APIs
            [require.resolve('next/dist/client/link')]:
              'next/dist/esm/client/link',
            [require.resolve('next/dist/client/image')]:
              'next/dist/esm/client/image',
            [require.resolve('next/dist/client/script')]:
              'next/dist/esm/client/script',
            [require.resolve('next/dist/client/router')]:
              'next/dist/esm/client/router',
            [require.resolve('next/dist/shared/lib/head')]:
              'next/dist/esm/shared/lib/head',
            [require.resolve('next/dist/shared/lib/dynamic')]:
              'next/dist/esm/shared/lib/dynamic',
            [require.resolve('next/dist/pages/_document')]:
              'next/dist/esm/pages/_document',
            [require.resolve('next/dist/pages/_app')]:
              'next/dist/esm/pages/_app',
            [require.resolve('next/dist/client/components/navigation')]:
              'next/dist/client/components/navigation',
            [require.resolve('next/dist/client/components/headers')]:
              'next/dist/client/components/headers',
          }
        : undefined),

      // For RSC server bundle
      ...(!hasExternalOtelApiPackage && {
        '@opentelemetry/api': 'next/dist/compiled/@opentelemetry/api',
      }),

      ...(config.images.loaderFile
        ? {
            'next/dist/shared/lib/image-loader': config.images.loaderFile,
            ...(isEdgeServer && {
              'next/dist/esm/shared/lib/image-loader': config.images.loaderFile,
            }),
          }
        : undefined),

      next: NEXT_PROJECT_ROOT,

      'styled-jsx/style$': require.resolve(`styled-jsx/style`),
      'styled-jsx$': require.resolve(`styled-jsx`),

      ...customAppAliases,
      ...customErrorAlias,
      ...customDocumentAliases,
      ...customRootAliases,

      ...(pagesDir ? { [PAGES_DIR_ALIAS]: pagesDir } : {}),
      ...(appDir ? { [APP_DIR_ALIAS]: appDir } : {}),
      [ROOT_DIR_ALIAS]: dir,
      [DOT_NEXT_ALIAS]: distDir,
      ...(isClient || isEdgeServer ? getOptimizedAliases() : {}),
      ...getReactProfilingInProduction(),

      [RSC_ACTION_VALIDATE_ALIAS]:
        'next/dist/build/webpack/loaders/next-flight-loader/action-validate',

      [RSC_ACTION_CLIENT_WRAPPER_ALIAS]:
        'next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper',

      [RSC_ACTION_PROXY_ALIAS]:
        'next/dist/build/webpack/loaders/next-flight-loader/action-proxy',

      ...(isClient || isEdgeServer
        ? {
            [clientResolveRewrites]: hasRewrites
              ? clientResolveRewrites
              : // With webpack 5 an alias can be pointed to false to noop
                false,
          }
        : {}),

      '@swc/helpers/_': path.join(
        path.dirname(require.resolve('@swc/helpers/package.json')),
        '_'
      ),

      setimmediate: 'next/dist/compiled/setimmediate',
    },
    ...(isClient || isEdgeServer
      ? {
          fallback: {
            process: require.resolve('./polyfills/process'),
          },
        }
      : undefined),
    mainFields: mainFieldsPerCompiler[compilerType],
    ...(isEdgeServer && {
      conditionNames: [
        ...mainFieldsPerCompiler[COMPILER_NAMES.edgeServer],
        'import',
        'node',
      ],
    }),
    plugins: [],
  }

  const terserOptions: any = {
    parse: {
      ecma: 8,
    },
    compress: {
      ecma: 5,
      warnings: false,
      // The following two options are known to break valid JavaScript code
      comparisons: false,
      inline: 2, // https://github.com/vercel/next.js/issues/7178#issuecomment-493048965
    },
    mangle: {
      safari10: true,
      ...(process.env.__NEXT_MANGLING_DEBUG || noMangling
        ? {
            toplevel: true,
            module: true,
            keep_classnames: true,
            keep_fnames: true,
          }
        : {}),
    },
    output: {
      ecma: 5,
      safari10: true,
      comments: false,
      // Fixes usage of Emoji and certain Regex
      ascii_only: true,
      ...(process.env.__NEXT_MANGLING_DEBUG || noMangling
        ? {
            beautify: true,
          }
        : {}),
    },
  }

  // Packages which will be split into the 'framework' chunk.
  // Only top-level packages are included, e.g. nested copies like
  // 'node_modules/meow/node_modules/object-assign' are not included.
  const topLevelFrameworkPaths: string[] = []
  const visitedFrameworkPackages = new Set<string>()

  // Adds package-paths of dependencies recursively
  const addPackagePath = (packageName: string, relativeToPath: string) => {
    try {
      if (visitedFrameworkPackages.has(packageName)) {
        return
      }
      visitedFrameworkPackages.add(packageName)

      const packageJsonPath = require.resolve(`${packageName}/package.json`, {
        paths: [relativeToPath],
      })

      // Include a trailing slash so that a `.startsWith(packagePath)` check avoids false positives
      // when one package name starts with the full name of a different package.
      // For example:
      //   "node_modules/react-slider".startsWith("node_modules/react")  // true
      //   "node_modules/react-slider".startsWith("node_modules/react/") // false
      const directory = path.join(packageJsonPath, '../')

      // Returning from the function in case the directory has already been added and traversed
      if (topLevelFrameworkPaths.includes(directory)) return
      topLevelFrameworkPaths.push(directory)
      const dependencies = require(packageJsonPath).dependencies || {}
      for (const name of Object.keys(dependencies)) {
        addPackagePath(name, directory)
      }
    } catch (_) {
      // don't error on failing to resolve framework packages
    }
  }

  for (const packageName of ['react', 'react-dom']) {
    addPackagePath(packageName, dir)
  }

  const crossOrigin = config.crossOrigin
  const looseEsmExternals = config.experimental?.esmExternals === 'loose'

  const optOutBundlingPackages = EXTERNAL_PACKAGES.concat(
    ...(config.experimental.serverComponentsExternalPackages || [])
  )
  const optOutBundlingPackageRegex = new RegExp(
    `[/\\\\]node_modules[/\\\\](${optOutBundlingPackages
      .map((p) => p.replace(/\//g, '[/\\\\]'))
      .join('|')})[/\\\\]`
  )

  let resolvedExternalPackageDirs: Map<string, string>

  async function handleExternals(
    context: string,
    request: string,
    dependencyType: string,
    layer: string | null,
    getResolve: (
      options: any
    ) => (
      resolveContext: string,
      resolveRequest: string
    ) => Promise<[string | null, boolean]>
  ) {
    // We need to externalize internal requests for files intended to
    // not be bundled.
    const isLocal: boolean =
      request.startsWith('.') ||
      // Always check for unix-style path, as webpack sometimes
      // normalizes as posix.
      path.posix.isAbsolute(request) ||
      // When on Windows, we also want to check for Windows-specific
      // absolute paths.
      (process.platform === 'win32' && path.win32.isAbsolute(request))

    // make sure import "next" shows a warning when imported
    // in pages/components
    if (request === 'next') {
      return `commonjs next/dist/lib/import-next-warning`
    }

    const isAppLayer = [
      WEBPACK_LAYERS.server,
      WEBPACK_LAYERS.client,
      WEBPACK_LAYERS.appClient,
      WEBPACK_LAYERS.action,
    ].includes(layer!)

    if (
      request === 'react/jsx-dev-runtime' ||
      request === 'react/jsx-runtime'
    ) {
      if (isAppLayer) {
        return `commonjs next/dist/compiled/${request.replace(
          'react',
          'react' + bundledReactChannel
        )}`
      }
      return
    }

    // Special internal modules that must be bundled for Server Components.
    if (layer === WEBPACK_LAYERS.server) {
      // React needs to be bundled for Server Components so the special
      // `react-server` export condition can be used.
      if (reactPackagesRegex.test(request)) {
        return
      }
    }

    // Relative requires don't need custom resolution, because they
    // are relative to requests we've already resolved here.
    // Absolute requires (require('/foo')) are extremely uncommon, but
    // also have no need for customization as they're already resolved.
    if (!isLocal) {
      if (/^(?:next$)/.test(request)) {
        return `commonjs ${request}`
      }

      if (reactPackagesRegex.test(request)) {
        // override react-dom to server-rendering-stub for server
        if (
          request === 'react-dom' &&
          (layer === WEBPACK_LAYERS.client ||
            layer === WEBPACK_LAYERS.server ||
            layer === WEBPACK_LAYERS.action)
        ) {
          request = `next/dist/compiled/react-dom${bundledReactChannel}/server-rendering-stub`
        } else if (isAppLayer) {
          request =
            'next/dist/compiled/' +
            request.replace(
              /^(react-server-dom-webpack|react-dom|react)/,
              (name) => {
                return name + bundledReactChannel
              }
            )
        }
        return `commonjs ${request}`
      }

      const notExternalModules =
        /^(?:private-next-pages\/|next\/(?:dist\/pages\/|(?:app|document|link|image|legacy\/image|constants|dynamic|script|navigation|headers)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-action-proxy$)/
      if (notExternalModules.test(request)) {
        return
      }
    }

    // @swc/helpers should not be external as it would
    // require hoisting the package which we can't rely on
    if (request.includes('@swc/helpers')) {
      return
    }

    // When in esm externals mode, and using import, we resolve with
    // ESM resolving options.
    // Also disable esm request when appDir is enabled
    const isEsmRequested = dependencyType === 'esm'

    const isLocalCallback = (localRes: string) => {
      // Makes sure dist/shared and dist/server are not bundled
      // we need to process shared `router/router`, `head` and `dynamic`,
      // so that the DefinePlugin can inject process.env values.

      // Treat next internals as non-external for server layer
      if (layer === WEBPACK_LAYERS.server) {
        return
      }

      const isNextExternal =
        /next[/\\]dist[/\\](esm[\\/])?(shared|server)[/\\](?!lib[/\\](router[/\\]router|dynamic|app-dynamic|lazy-dynamic|head[^-]))/.test(
          localRes
        )

      if (isNextExternal) {
        // Generate Next.js external import
        const externalRequest = path.posix.join(
          'next',
          'dist',
          path
            .relative(
              // Root of Next.js package:
              path.join(__dirname, '..'),
              localRes
            )
            // Windows path normalization
            .replace(/\\/g, '/')
        )
        return `commonjs ${externalRequest}`
      }
    }

    const resolveResult = await resolveExternal(
      dir,
      config.experimental.esmExternals,
      context,
      request,
      isEsmRequested,
      hasAppDir,
      getResolve,
      isLocal ? isLocalCallback : undefined
    )

    if ('localRes' in resolveResult) {
      return resolveResult.localRes
    }

    // Forcedly resolve the styled-jsx installed by next.js,
    // since `resolveExternal` cannot find the styled-jsx dep with pnpm
    if (request === 'styled-jsx/style') {
      resolveResult.res = require.resolve(request)
    }

    // Don't bundle @vercel/og nodejs bundle for nodejs runtime
    // TODO-APP: bundle route.js with different layer that externals common node_module deps
    if (
      layer === WEBPACK_LAYERS.server &&
      request === 'next/dist/compiled/@vercel/og/index.node.js'
    ) {
      return `module ${request}`
    }

    const { res, isEsm } = resolveResult

    // If the request cannot be resolved we need to have
    // webpack "bundle" it so it surfaces the not found error.
    if (!res) {
      return
    }

    // ESM externals can only be imported (and not required).
    // Make an exception in loose mode.
    if (!isEsmRequested && isEsm && !looseEsmExternals) {
      throw new Error(
        `ESM packages (${request}) need to be imported. Use 'import' to reference the package instead. https://nextjs.org/docs/messages/import-esm-externals`
      )
    }

    const externalType = isEsm ? 'module' : 'commonjs'

    if (
      /next[/\\]dist[/\\](esm[\\/])?shared[/\\](?!lib[/\\]router[/\\]router)/.test(
        res
      ) ||
      /next[/\\]dist[/\\]compiled[/\\].*\.[mc]?js$/.test(res)
    ) {
      return `${externalType} ${request}`
    }

    // Default pages have to be transpiled
    if (
      /[/\\]next[/\\]dist[/\\]/.test(res) ||
      // This is the @babel/plugin-transform-runtime "helpers: true" option
      /node_modules[/\\]@babel[/\\]runtime[/\\]/.test(res)
    ) {
      return
    }

    // Webpack itself has to be compiled because it doesn't always use module relative paths
    if (
      /node_modules[/\\]webpack/.test(res) ||
      /node_modules[/\\]css-loader/.test(res)
    ) {
      return
    }

    // If a package should be transpiled by Next.js, we skip making it external.
    // It doesn't matter what the extension is, as we'll transpile it anyway.
    if (config.transpilePackages && !resolvedExternalPackageDirs) {
      resolvedExternalPackageDirs = new Map()
      // We need to resolve all the external package dirs initially.
      for (const pkg of config.transpilePackages) {
        const pkgRes = await resolveExternal(
          dir,
          config.experimental.esmExternals,
          context,
          pkg + '/package.json',
          hasAppDir,
          isEsmRequested,
          getResolve,
          isLocal ? isLocalCallback : undefined
        )
        if (pkgRes.res) {
          resolvedExternalPackageDirs.set(pkg, path.dirname(pkgRes.res))
        }
      }
    }

    // If a package is included in `transpilePackages`, we don't want to make it external.
    // And also, if that resource is an ES module, we bundle it too because we can't
    // rely on the require hook to alias `react` to our precompiled version.
    const shouldBeBundled =
      isResourceInPackages(
        res,
        config.transpilePackages,
        resolvedExternalPackageDirs
      ) ||
      (isEsm && isAppLayer)

    if (/node_modules[/\\].*\.[mc]?js$/.test(res)) {
      if (layer === WEBPACK_LAYERS.server) {
        // All packages should be bundled for the server layer if they're not opted out.
        // This option takes priority over the transpilePackages option.

        if (optOutBundlingPackageRegex.test(res)) {
          return `${externalType} ${request}`
        }

        return
      }

      // Treat react packages and next internals as external for SSR layer,
      // also map react to builtin ones with require-hook.
      if (layer === WEBPACK_LAYERS.client) {
        if (reactPackagesRegex.test(request)) {
          return `commonjs next/dist/compiled/${request.replace(
            /^(react-server-dom-webpack|react-dom|react)/,
            (name) => {
              return name + bundledReactChannel
            }
          )}`
        }
        return
      }

      if (shouldBeBundled) return

      // Anything else that is standard JavaScript within `node_modules`
      // can be externalized.
      return `${externalType} ${request}`
    }

    if (shouldBeBundled) return

    // Default behavior: bundle the code!
  }

  const shouldIncludeExternalDirs =
    config.experimental.externalDir || !!config.transpilePackages

  const codeCondition = {
    test: /\.(tsx|ts|js|cjs|mjs|jsx)$/,
    ...(shouldIncludeExternalDirs
      ? // Allowing importing TS/TSX files from outside of the root dir.
        {}
      : { include: [dir, ...babelIncludeRegexes] }),
    exclude: (excludePath: string) => {
      if (babelIncludeRegexes.some((r) => r.test(excludePath))) {
        return false
      }

      const shouldBeBundled = isResourceInPackages(
        excludePath,
        config.transpilePackages
      )
      if (shouldBeBundled) return false

      return excludePath.includes('node_modules')
    },
  }

  let webpackConfig: webpack.Configuration = {
    parallelism: Number(process.env.NEXT_WEBPACK_PARALLELISM) || undefined,
    ...(isNodeServer ? { externalsPresets: { node: true } } : {}),
    // @ts-ignore
    externals:
      isClient || isEdgeServer
        ? // make sure importing "next" is handled gracefully for client
          // bundles in case a user imported types and it wasn't removed
          // TODO: should we warn/error for this instead?
          [
            'next',
            ...(isEdgeServer
              ? [
                  {
                    '@builder.io/partytown': '{}',
                    'next/dist/compiled/etag': '{}',
                    'next/dist/compiled/chalk': '{}',
                    './cjs/react-dom-server-legacy.browser.production.min.js':
                      '{}',
                    './cjs/react-dom-server-legacy.browser.development.js':
                      '{}',
                  },
                  getEdgePolyfilledModules(),
                  handleWebpackExternalForEdgeRuntime,
                ]
              : []),
          ]
        : [
            ({
              context,
              request,
              dependencyType,
              contextInfo,
              getResolve,
            }: {
              context: string
              request: string
              dependencyType: string
              contextInfo: {
                issuer: string
                issuerLayer: string | null
                compiler: string
              }
              getResolve: (
                options: any
              ) => (
                resolveContext: string,
                resolveRequest: string,
                callback: (
                  err?: Error,
                  result?: string,
                  resolveData?: { descriptionFileData?: { type?: any } }
                ) => void
              ) => void
            }) =>
              handleExternals(
                context,
                request,
                dependencyType,
                contextInfo.issuerLayer,
                (options) => {
                  const resolveFunction = getResolve(options)
                  return (resolveContext: string, requestToResolve: string) =>
                    new Promise((resolve, reject) => {
                      resolveFunction(
                        resolveContext,
                        requestToResolve,
                        (err, result, resolveData) => {
                          if (err) return reject(err)
                          if (!result) return resolve([null, false])
                          const isEsm = /\.js$/i.test(result)
                            ? resolveData?.descriptionFileData?.type ===
                              'module'
                            : /\.mjs$/i.test(result)
                          resolve([result, isEsm])
                        }
                      )
                    })
                }
              ),
          ],
    optimization: {
      emitOnErrors: !dev,
      checkWasmTypes: false,
      nodeEnv: false,
      splitChunks: (():
        | Required<webpack.Configuration>['optimization']['splitChunks']
        | false => {
        if (dev) {
          return false
        }

        if (isNodeServer) {
          return {
            filename: '[name].js',
            chunks: 'all',
            minSize: 1000,
          }
        }

        if (isEdgeServer) {
          return {
            filename: 'edge-chunks/[name].js',
            minChunks: 2,
          }
        }

        return {
          // Keep main and _app chunks unsplitted in webpack 5
          // as we don't need a separate vendor chunk from that
          // and all other chunk depend on them so there is no
          // duplication that need to be pulled out.
          chunks: (chunk: any) =>
            !/^(polyfills|main|pages\/_app)$/.test(chunk.name),
          cacheGroups: {
            framework: {
              chunks: 'all',
              name: 'framework',
              test(module: any) {
                const resource = module.nameForCondition?.()
                return resource
                  ? topLevelFrameworkPaths.some((pkgPath) =>
                      resource.startsWith(pkgPath)
                    )
                  : false
              },
              priority: 40,
              // Don't let webpack eliminate this chunk (prevents this chunk from
              // becoming a part of the commons chunk)
              enforce: true,
            },
            lib: {
              test(module: {
                size: Function
                nameForCondition: Function
              }): boolean {
                return (
                  module.size() > 160000 &&
                  /node_modules[/\\]/.test(module.nameForCondition() || '')
                )
              },
              name(module: {
                type: string
                libIdent?: Function
                updateHash: (hash: crypto.Hash) => void
              }): string {
                const hash = crypto.createHash('sha1')
                if (isModuleCSS(module)) {
                  module.updateHash(hash)
                } else {
                  if (!module.libIdent) {
                    throw new Error(
                      `Encountered unknown module type: ${module.type}. Please open an issue.`
                    )
                  }
                  hash.update(module.libIdent({ context: dir }))
                }

                return hash.digest('hex').substring(0, 8)
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
          },
          maxInitialRequests: 25,
          minSize: 20000,
        }
      })(),
      runtimeChunk: isClient
        ? { name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK }
        : undefined,
      minimize: !dev && (isClient || isEdgeServer),
      minimizer: [
        // Minify JavaScript
        (compiler: webpack.Compiler) => {
          // @ts-ignore No typings yet
          const {
            TerserPlugin,
          } = require('./webpack/plugins/terser-webpack-plugin/src/index.js')
          new TerserPlugin({
            cacheDir: path.join(distDir, 'cache', 'next-minifier'),
            parallel: config.experimental.cpus,
            swcMinify: config.swcMinify,
            terserOptions: {
              ...terserOptions,
              compress: {
                ...terserOptions.compress,
              },
              mangle: {
                ...terserOptions.mangle,
              },
            },
          }).apply(compiler)
        },
        // Minify CSS
        (compiler: webpack.Compiler) => {
          const {
            CssMinimizerPlugin,
          } = require('./webpack/plugins/css-minimizer-plugin')
          new CssMinimizerPlugin({
            postcssOptions: {
              map: {
                // `inline: false` generates the source map in a separate file.
                // Otherwise, the CSS file is needlessly large.
                inline: false,
                // `annotation: false` skips appending the `sourceMappingURL`
                // to the end of the CSS file. Webpack already handles this.
                annotation: false,
              },
            },
          }).apply(compiler)
        },
      ],
    },
    context: dir,
    // Kept as function to be backwards compatible
    entry: async () => {
      return {
        ...(clientEntries ? clientEntries : {}),
        ...entrypoints,
      }
    },
    watchOptions,
    output: {
      // we must set publicPath to an empty value to override the default of
      // auto which doesn't work in IE11
      publicPath: `${config.assetPrefix || ''}/_next/`,
      path: !dev && isNodeServer ? path.join(outputPath, 'chunks') : outputPath,
      // On the server we don't use hashes
      filename:
        isNodeServer || isEdgeServer
          ? dev || isEdgeServer
            ? `[name].js`
            : `../[name].js`
          : `static/chunks/${isDevFallback ? 'fallback/' : ''}[name]${
              dev ? '' : appDir ? '-[chunkhash]' : '-[contenthash]'
            }.js`,
      library: isClient || isEdgeServer ? '_N_E' : undefined,
      libraryTarget: isClient || isEdgeServer ? 'assign' : 'commonjs2',
      hotUpdateChunkFilename: 'static/webpack/[id].[fullhash].hot-update.js',
      hotUpdateMainFilename:
        'static/webpack/[fullhash].[runtime].hot-update.json',
      // This saves chunks with the name given via `import()`
      chunkFilename:
        isNodeServer || isEdgeServer
          ? '[name].js'
          : `static/chunks/${isDevFallback ? 'fallback/' : ''}${
              dev ? '[name]' : '[name].[contenthash]'
            }.js`,
      strictModuleExceptionHandling: true,
      crossOriginLoading: crossOrigin,
      webassemblyModuleFilename: 'static/wasm/[modulehash].wasm',
      hashFunction: 'xxhash64',
      hashDigestLength: 16,
    },
    performance: false,
    resolve: resolveConfig,
    resolveLoader: {
      // The loaders Next.js provides
      alias: [
        'error-loader',
        'next-swc-loader',
        'next-client-pages-loader',
        'next-image-loader',
        'next-metadata-image-loader',
        'next-style-loader',
        'next-flight-loader',
        'next-flight-client-entry-loader',
        'next-flight-action-entry-loader',
        'next-flight-client-module-loader',
        'noop-loader',
        'next-middleware-loader',
        'next-edge-function-loader',
        'next-edge-app-route-loader',
        'next-edge-ssr-loader',
        'next-middleware-asset-loader',
        'next-middleware-wasm-loader',
        'next-app-loader',
        'next-font-loader',
        'next-invalid-import-error-loader',
        'next-metadata-route-loader',
      ].reduce((alias, loader) => {
        // using multiple aliases to replace `resolveLoader.modules`
        alias[loader] = path.join(__dirname, 'webpack', 'loaders', loader)

        return alias
      }, {} as Record<string, string>),
      modules: [
        'node_modules',
        ...nodePathList, // Support for NODE_PATH environment variable
      ],
      plugins: [],
    },
    module: {
      rules: [
        ...(hasAppDir
          ? [
              {
                // All app dir layers need to use this configured resolution logic
                issuerLayer: {
                  or: [
                    WEBPACK_LAYERS.server,
                    WEBPACK_LAYERS.client,
                    WEBPACK_LAYERS.appClient,
                    WEBPACK_LAYERS.action,
                    WEBPACK_LAYERS.shared,
                  ],
                },
                resolve: {
                  alias: {
                    // Alias next/head component to noop for RSC
                    [require.resolve('next/head')]: require.resolve(
                      'next/dist/client/components/noop-head'
                    ),
                    // Alias next/dynamic
                    [require.resolve('next/dynamic')]: require.resolve(
                      'next/dist/shared/lib/app-dynamic'
                    ),
                    'react/jsx-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-runtime`,
                    'react/jsx-dev-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-dev-runtime`,
                    'react-dom/server.edge$': `next/dist/compiled/react-dom${bundledReactChannel}/server.edge`,
                    'react-server-dom-webpack/client$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client`,
                    'react-server-dom-webpack/client.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client.edge`,
                    'react-server-dom-webpack/server.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.edge`,
                    'react-server-dom-webpack/server.node$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.node`,
                  },
                },
              },
            ]
          : []),
        ...(hasAppDir && !isClient
          ? [
              {
                issuerLayer: {
                  or: [WEBPACK_LAYERS.server, WEBPACK_LAYERS.action],
                },
                test: {
                  // Resolve it if it is a source code file, and it has NOT been
                  // opted out of bundling.
                  and: [
                    codeCondition.test,
                    {
                      not: [optOutBundlingPackageRegex, asyncStoragesRegex],
                    },
                  ],
                },
                resolve: {
                  conditionNames: reactServerCondition,
                  alias: {
                    // If missing the alias override here, the default alias will be used which aliases
                    // react to the direct file path, not the package name. In that case the condition
                    // will be ignored completely.
                    react: `next/dist/compiled/react${bundledReactChannel}/react.shared-subset`,
                    'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}/server-rendering-stub`,
                  },
                },
                use: {
                  loader: 'next-flight-loader',
                },
              },
              {
                // Make sure that AsyncLocalStorage module instance is shared between server and client
                // layers.
                layer: WEBPACK_LAYERS.shared,
                test: asyncStoragesRegex,
              },
            ]
          : []),
        // TODO: FIXME: do NOT webpack 5 support with this
        // x-ref: https://github.com/webpack/webpack/issues/11467
        ...(!config.experimental.fullySpecified
          ? [
              {
                test: /\.m?js/,
                resolve: {
                  fullySpecified: false,
                },
              } as any,
            ]
          : []),
        ...(hasAppDir && isEdgeServer
          ? [
              // The Edge bundle includes the server in its entrypoint, so it has to
              // be in the SSR layer — here we convert the actual page request to
              // the RSC layer via a webpack rule.
              {
                resourceQuery: /__edge_ssr_entry__/,
                layer: WEBPACK_LAYERS.server,
              },
            ]
          : []),
        ...(hasServerComponents
          ? [
              {
                // Alias react-dom for ReactDOM.preload usage.
                // Alias react for switching between default set and share subset.
                oneOf: [
                  {
                    exclude: [asyncStoragesRegex],
                    issuerLayer: {
                      or: [WEBPACK_LAYERS.server, WEBPACK_LAYERS.action],
                    },
                    test: {
                      // Resolve it if it is a source code file, and it has NOT been
                      // opted out of bundling.
                      and: [
                        codeCondition.test,
                        {
                          not: [optOutBundlingPackageRegex],
                        },
                      ],
                    },
                    resolve: {
                      // It needs `conditionNames` here to require the proper asset,
                      // when react is acting as dependency of compiled/react-dom.
                      alias: {
                        react: `next/dist/compiled/react${bundledReactChannel}/react.shared-subset`,
                        // Use server rendering stub for RSC
                        // x-ref: https://github.com/facebook/react/pull/25436
                        'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}/server-rendering-stub`,
                      },
                    },
                  },
                  {
                    issuerLayer: WEBPACK_LAYERS.client,
                    test: codeCondition.test,
                    resolve: {
                      alias: {
                        react: `next/dist/compiled/react${bundledReactChannel}`,
                        'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}/server-rendering-stub`,
                      },
                    },
                  },
                  {
                    test: codeCondition.test,
                    resolve: {
                      alias: {
                        react: `next/dist/compiled/react${bundledReactChannel}`,
                        'react-dom$': reactProductionProfiling
                          ? `next/dist/compiled/react-dom${bundledReactChannel}/cjs/react-dom.profiling.min`
                          : `next/dist/compiled/react-dom${bundledReactChannel}`,
                        'react-dom/client$': `next/dist/compiled/react-dom${bundledReactChannel}/client`,
                      },
                    },
                  },
                ],
              },
            ]
          : []),
        {
          oneOf: [
            {
              ...codeCondition,
              issuerLayer: WEBPACK_LAYERS.api,
              parser: {
                // Switch back to normal URL handling
                url: true,
              },
              use: loaderForAPIRoutes,
            },
            {
              ...codeCondition,
              issuerLayer: WEBPACK_LAYERS.middleware,
              use: defaultLoaders.babel,
            },
            ...(hasServerComponents
              ? [
                  {
                    test: codeCondition.test,
                    issuerLayer: {
                      or: [WEBPACK_LAYERS.server, WEBPACK_LAYERS.action],
                    },
                    exclude: [asyncStoragesRegex],
                    use: swcLoaderForServerLayer,
                  },
                  {
                    test: codeCondition.test,
                    resourceQuery: /__edge_ssr_entry__/,
                    use: swcLoaderForServerLayer,
                  },
                  {
                    ...codeCondition,
                    issuerLayer: {
                      or: [WEBPACK_LAYERS.client, WEBPACK_LAYERS.appClient],
                    },
                    exclude: [asyncStoragesRegex, codeCondition.exclude],
                    use: [
                      ...(dev && isClient
                        ? [
                            require.resolve(
                              'next/dist/compiled/@next/react-refresh-utils/dist/loader'
                            ),
                          ]
                        : []),
                      {
                        // This loader handles actions and client entries
                        // in the client layer.
                        loader: 'next-flight-client-module-loader',
                      },
                      ...swcLoaderForClientLayer,
                    ],
                  },
                ]
              : []),
            {
              ...codeCondition,
              use:
                dev && isClient
                  ? [
                      require.resolve(
                        'next/dist/compiled/@next/react-refresh-utils/dist/loader'
                      ),
                      defaultLoaders.babel,
                    ]
                  : defaultLoaders.babel,
            },
          ],
        },
        ...(!config.images.disableStaticImages
          ? [
              {
                test: nextImageLoaderRegex,
                loader: 'next-image-loader',
                issuer: { not: regexLikeCss },
                dependency: { not: ['url'] },
                resourceQuery: { not: [METADATA_RESOURCE_QUERY] },
                options: {
                  isServer: isNodeServer || isEdgeServer,
                  isDev: dev,
                  basePath: config.basePath,
                  assetPrefix: config.assetPrefix,
                },
              },
            ]
          : []),
        ...(isEdgeServer
          ? [
              {
                resolve: {
                  fallback: {
                    process: require.resolve('./polyfills/process'),
                  },
                },
              },
            ]
          : isClient
          ? [
              {
                resolve: {
                  fallback:
                    config.experimental.fallbackNodePolyfills === false
                      ? {
                          assert: false,
                          buffer: false,
                          constants: false,
                          crypto: false,
                          domain: false,
                          http: false,
                          https: false,
                          os: false,
                          path: false,
                          punycode: false,
                          process: false,
                          querystring: false,
                          stream: false,
                          string_decoder: false,
                          sys: false,
                          timers: false,
                          tty: false,
                          util: false,
                          vm: false,
                          zlib: false,
                          events: false,
                          setImmediate: false,
                        }
                      : {
                          assert: require.resolve('next/dist/compiled/assert'),
                          buffer: require.resolve('next/dist/compiled/buffer/'),
                          constants: require.resolve(
                            'next/dist/compiled/constants-browserify'
                          ),
                          crypto: require.resolve(
                            'next/dist/compiled/crypto-browserify'
                          ),
                          domain: require.resolve(
                            'next/dist/compiled/domain-browser'
                          ),
                          http: require.resolve(
                            'next/dist/compiled/stream-http'
                          ),
                          https: require.resolve(
                            'next/dist/compiled/https-browserify'
                          ),
                          os: require.resolve(
                            'next/dist/compiled/os-browserify'
                          ),
                          path: require.resolve(
                            'next/dist/compiled/path-browserify'
                          ),
                          punycode: require.resolve(
                            'next/dist/compiled/punycode'
                          ),
                          process: require.resolve('./polyfills/process'),
                          // Handled in separate alias
                          querystring: require.resolve(
                            'next/dist/compiled/querystring-es3'
                          ),
                          stream: require.resolve(
                            'next/dist/compiled/stream-browserify'
                          ),
                          string_decoder: require.resolve(
                            'next/dist/compiled/string_decoder'
                          ),
                          sys: require.resolve('next/dist/compiled/util/'),
                          timers: require.resolve(
                            'next/dist/compiled/timers-browserify'
                          ),
                          tty: require.resolve(
                            'next/dist/compiled/tty-browserify'
                          ),
                          // Handled in separate alias
                          // url: require.resolve('url/'),
                          util: require.resolve('next/dist/compiled/util/'),
                          vm: require.resolve(
                            'next/dist/compiled/vm-browserify'
                          ),
                          zlib: require.resolve(
                            'next/dist/compiled/browserify-zlib'
                          ),
                          events: require.resolve('next/dist/compiled/events/'),
                          setImmediate: require.resolve(
                            'next/dist/compiled/setimmediate'
                          ),
                        },
                },
              },
            ]
          : []),
        {
          test: /node_modules[/\\]client-only[/\\]error.js/,
          loader: 'next-invalid-import-error-loader',
          issuerLayer: {
            or: [WEBPACK_LAYERS.server, WEBPACK_LAYERS.action],
          },
          options: {
            message:
              "'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.",
          },
        },
        {
          test: /node_modules[/\\]server-only[/\\]index.js/,
          loader: 'next-invalid-import-error-loader',
          issuerLayer: WEBPACK_LAYERS.client,
          options: {
            message:
              "'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.",
          },
        },
      ].filter(Boolean),
    },
    plugins: [
      dev && isClient && new ReactRefreshWebpackPlugin(webpack),
      // Makes sure `Buffer` and `process` are polyfilled in client and flight bundles (same behavior as webpack 4)
      (isClient || isEdgeServer) &&
        new webpack.ProvidePlugin({
          // Buffer is used by getInlineScriptSource
          Buffer: [require.resolve('buffer'), 'Buffer'],
          // Avoid process being overridden when in web run time
          ...(isClient && { process: [require.resolve('process')] }),
        }),
      new webpack.DefinePlugin(
        getDefineEnv({
          dev,
          config,
          distDir,
          isClient,
          hasRewrites,
          isNodeServer,
          isEdgeServer,
          middlewareMatchers,
          clientRouterFilters,
          previewModeId,
          fetchCacheKeyPrefix,
          allowedRevalidateHeaderKeys,
        })
      ),
      isClient &&
        new ReactLoadablePlugin({
          filename: REACT_LOADABLE_MANIFEST,
          pagesDir,
          runtimeAsset: `server/${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`,
          dev,
        }),
      (isClient || isEdgeServer) && new DropClientPage(),
      config.outputFileTracing &&
        isNodeServer &&
        !dev &&
        new (require('./webpack/plugins/next-trace-entrypoints-plugin')
          .TraceEntryPointsPlugin as typeof import('./webpack/plugins/next-trace-entrypoints-plugin').TraceEntryPointsPlugin)(
          {
            rootDir: dir,
            appDir: appDir,
            pagesDir: pagesDir,
            esmExternals: config.experimental.esmExternals,
            outputFileTracingRoot: config.experimental.outputFileTracingRoot,
            appDirEnabled: hasAppDir,
            turbotrace: config.experimental.turbotrace,
            traceIgnores: config.experimental.outputFileTracingIgnores || [],
          }
        ),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how Webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      config.excludeDefaultMomentLocales &&
        new webpack.IgnorePlugin({
          resourceRegExp: /^\.\/locale$/,
          contextRegExp: /moment$/,
        }),
      ...(dev
        ? (() => {
            // Even though require.cache is server only we have to clear assets from both compilations
            // This is because the client compilation generates the build manifest that's used on the server side
            const {
              NextJsRequireCacheHotReloader,
            } = require('./webpack/plugins/nextjs-require-cache-hot-reloader')
            const devPlugins = [
              new NextJsRequireCacheHotReloader({
                hasServerComponents,
              }),
            ]

            if (isClient || isEdgeServer) {
              devPlugins.push(new webpack.HotModuleReplacementPlugin())
            }

            return devPlugins
          })()
        : []),
      !dev &&
        new webpack.IgnorePlugin({
          resourceRegExp: /react-is/,
          contextRegExp: /next[\\/]dist[\\/]/,
        }),
      (isNodeServer || isEdgeServer) &&
        new PagesManifestPlugin({
          dev,
          isEdgeRuntime: isEdgeServer,
          appDirEnabled: hasAppDir,
        }),
      // MiddlewarePlugin should be after DefinePlugin so  NEXT_PUBLIC_*
      // replacement is done before its process.env.* handling
      isEdgeServer &&
        new MiddlewarePlugin({
          dev,
          sriEnabled: !dev && !!config.experimental.sri?.algorithm,
        }),
      isClient &&
        new BuildManifestPlugin({
          buildId,
          rewrites,
          isDevFallback,
          exportRuntime: true,
          appDirEnabled: hasAppDir,
        }),
      new ProfilingPlugin({ runWebpackSpan }),
      config.optimizeFonts &&
        !dev &&
        isNodeServer &&
        (function () {
          const { FontStylesheetGatheringPlugin } =
            require('./webpack/plugins/font-stylesheet-gathering-plugin') as {
              FontStylesheetGatheringPlugin: typeof import('./webpack/plugins/font-stylesheet-gathering-plugin').FontStylesheetGatheringPlugin
            }
          return new FontStylesheetGatheringPlugin({
            adjustFontFallbacks: config.experimental.adjustFontFallbacks,
            adjustFontFallbacksWithSizeAdjust:
              config.experimental.adjustFontFallbacksWithSizeAdjust,
          })
        })(),
      new WellKnownErrorsPlugin(),
      isClient &&
        new CopyFilePlugin({
          filePath: require.resolve('./polyfills/polyfill-nomodule'),
          cacheKey: process.env.__NEXT_VERSION as string,
          name: `static/chunks/polyfills${dev ? '' : '-[hash]'}.js`,
          minimize: false,
          info: {
            [CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL]: 1,
            // This file is already minified
            minimized: true,
          },
        }),
      hasAppDir && isClient && new AppBuildManifestPlugin({ dev }),
      hasServerComponents &&
        (isClient
          ? new ClientReferenceManifestPlugin({
              dev,
              appDir,
            })
          : new ClientReferenceEntryPlugin({
              appDir,
              dev,
              isEdgeServer,
              useServerActions: serverActions,
            })),
      hasAppDir &&
        !isClient &&
        new NextTypesPlugin({
          dir,
          distDir: config.distDir,
          appDir,
          dev,
          isEdgeServer,
          pageExtensions: config.pageExtensions,
          typedRoutes: enableTypedRoutes,
          originalRewrites,
          originalRedirects,
        }),
      !dev &&
        isClient &&
        !!config.experimental.sri?.algorithm &&
        new SubresourceIntegrityPlugin(config.experimental.sri.algorithm),
      isClient &&
        new NextFontManifestPlugin({
          appDirEnabled: !!config.experimental.appDir,
        }),
      !dev &&
        isClient &&
        new (require('./webpack/plugins/telemetry-plugin').TelemetryPlugin)(
          new Map(
            [
              ['swcLoader', useSWCLoader],
              ['swcMinify', config.swcMinify],
              ['swcRelay', !!config.compiler?.relay],
              ['swcStyledComponents', !!config.compiler?.styledComponents],
              [
                'swcReactRemoveProperties',
                !!config.compiler?.reactRemoveProperties,
              ],
              [
                'swcExperimentalDecorators',
                !!jsConfig?.compilerOptions?.experimentalDecorators,
              ],
              ['swcRemoveConsole', !!config.compiler?.removeConsole],
              ['swcImportSource', !!jsConfig?.compilerOptions?.jsxImportSource],
              ['swcEmotion', !!config.compiler?.emotion],
              ['turbotrace', !!config.experimental.turbotrace],
              ['transpilePackages', !!config.transpilePackages],
              [
                'skipMiddlewareUrlNormalize',
                !!config.skipMiddlewareUrlNormalize,
              ],
              ['skipTrailingSlashRedirect', !!config.skipTrailingSlashRedirect],
              ['modularizeImports', !!config.modularizeImports],
              SWCBinaryTarget,
            ].filter<[Feature, boolean]>(Boolean as any)
          )
        ),
    ].filter(Boolean as any as ExcludesFalse),
  }

  // Support tsconfig and jsconfig baseUrl
  if (resolvedBaseUrl) {
    webpackConfig.resolve?.modules?.push(resolvedBaseUrl)
  }

  // allows add JsConfigPathsPlugin to allow hot-reloading
  // if the config is added/removed
  webpackConfig.resolve?.plugins?.unshift(
    new JsConfigPathsPlugin(
      jsConfig?.compilerOptions?.paths || {},
      resolvedBaseUrl || dir
    )
  )

  const webpack5Config = webpackConfig as webpack.Configuration

  if (isEdgeServer) {
    webpack5Config.module?.rules?.unshift({
      test: /\.wasm$/,
      loader: 'next-middleware-wasm-loader',
      type: 'javascript/auto',
      resourceQuery: /module/i,
    })
    webpack5Config.module?.rules?.unshift({
      dependency: 'url',
      loader: 'next-middleware-asset-loader',
      type: 'javascript/auto',
      layer: WEBPACK_LAYERS.edgeAsset,
    })
    webpack5Config.module?.rules?.unshift({
      issuerLayer: WEBPACK_LAYERS.edgeAsset,
      type: 'asset/source',
    })
  }

  webpack5Config.experiments = {
    layers: true,
    cacheUnaffected: true,
    buildHttp: Array.isArray(config.experimental.urlImports)
      ? {
          allowedUris: config.experimental.urlImports,
          cacheLocation: path.join(dir, 'next.lock/data'),
          lockfileLocation: path.join(dir, 'next.lock/lock.json'),
        }
      : config.experimental.urlImports
      ? {
          cacheLocation: path.join(dir, 'next.lock/data'),
          lockfileLocation: path.join(dir, 'next.lock/lock.json'),
          ...config.experimental.urlImports,
        }
      : undefined,
  }

  webpack5Config.module!.parser = {
    javascript: {
      url: 'relative',
    },
  }
  webpack5Config.module!.generator = {
    asset: {
      filename: 'static/media/[name].[hash:8][ext]',
    },
  }

  if (!webpack5Config.output) {
    webpack5Config.output = {}
  }
  if (isClient) {
    webpack5Config.output.trustedTypes = 'nextjs#bundler'
  }

  if (isClient || isEdgeServer) {
    webpack5Config.output.enabledLibraryTypes = ['assign']
  }

  if (dev) {
    // @ts-ignore unsafeCache exists
    webpack5Config.module.unsafeCache = (module) =>
      !/[\\/]pages[\\/][^\\/]+(?:$|\?|#)/.test(module.resource)
  }

  // This enables managedPaths for all node_modules
  // and also for the unplugged folder when using yarn pnp
  // It also add the yarn cache to the immutable paths
  webpack5Config.snapshot = {}
  if (process.versions.pnp === '3') {
    webpack5Config.snapshot.managedPaths = [
      /^(.+?(?:[\\/]\.yarn[\\/]unplugged[\\/][^\\/]+)?[\\/]node_modules[\\/])/,
    ]
  } else {
    webpack5Config.snapshot.managedPaths = [/^(.+?[\\/]node_modules[\\/])/]
  }
  if (process.versions.pnp === '3') {
    webpack5Config.snapshot.immutablePaths = [
      /^(.+?[\\/]cache[\\/][^\\/]+\.zip[\\/]node_modules[\\/])/,
    ]
  }

  if (dev) {
    if (!webpack5Config.optimization) {
      webpack5Config.optimization = {}
    }

    // For Server Components, it's necessary to have provided exports collected
    // to generate the correct flight manifest.
    if (!hasServerComponents) {
      webpack5Config.optimization.providedExports = false
    }
    webpack5Config.optimization.usedExports = false
  }

  const configVars = JSON.stringify({
    appDir: config.experimental.appDir,
    crossOrigin: config.crossOrigin,
    pageExtensions: pageExtensions,
    trailingSlash: config.trailingSlash,
    buildActivity: config.devIndicators.buildActivity,
    buildActivityPosition: config.devIndicators.buildActivityPosition,
    productionBrowserSourceMaps: !!config.productionBrowserSourceMaps,
    reactStrictMode: config.reactStrictMode,
    optimizeFonts: config.optimizeFonts,
    optimizeCss: config.experimental.optimizeCss,
    nextScriptWorkers: config.experimental.nextScriptWorkers,
    scrollRestoration: config.experimental.scrollRestoration,
    serverActions: config.experimental.serverActions,
    typedRoutes: config.experimental.typedRoutes,
    basePath: config.basePath,
    pageEnv: config.experimental.pageEnv,
    excludeDefaultMomentLocales: config.excludeDefaultMomentLocales,
    assetPrefix: config.assetPrefix,
    disableOptimizedLoading,
    isEdgeRuntime: isEdgeServer,
    reactProductionProfiling,
    webpack: !!config.webpack,
    hasRewrites,
    swcMinify: config.swcMinify,
    swcLoader: useSWCLoader,
    removeConsole: config.compiler?.removeConsole,
    reactRemoveProperties: config.compiler?.reactRemoveProperties,
    styledComponents: config.compiler?.styledComponents,
    relay: config.compiler?.relay,
    emotion: config.compiler?.emotion,
    modularizeImports: config.modularizeImports,
    legacyBrowsers: config.experimental?.legacyBrowsers,
    imageLoaderFile: config.images.loaderFile,
  })

  const cache: any = {
    type: 'filesystem',
    // Includes:
    //  - Next.js version
    //  - next.config.js keys that affect compilation
    version: `${process.env.__NEXT_VERSION}|${configVars}`,
    cacheDirectory: path.join(distDir, 'cache', 'webpack'),
  }

  // Adds `next.config.js` as a buildDependency when custom webpack config is provided
  if (config.webpack && config.configFile) {
    cache.buildDependencies = {
      config: [config.configFile],
    }
  }

  webpack5Config.cache = cache

  if (process.env.NEXT_WEBPACK_LOGGING) {
    const infra = process.env.NEXT_WEBPACK_LOGGING.includes('infrastructure')
    const profileClient =
      process.env.NEXT_WEBPACK_LOGGING.includes('profile-client')
    const profileServer =
      process.env.NEXT_WEBPACK_LOGGING.includes('profile-server')
    const summaryClient =
      process.env.NEXT_WEBPACK_LOGGING.includes('summary-client')
    const summaryServer =
      process.env.NEXT_WEBPACK_LOGGING.includes('summary-server')

    const profile =
      (profileClient && isClient) ||
      (profileServer && (isNodeServer || isEdgeServer))
    const summary =
      (summaryClient && isClient) ||
      (summaryServer && (isNodeServer || isEdgeServer))

    const logDefault = !infra && !profile && !summary

    if (logDefault || infra) {
      webpack5Config.infrastructureLogging = {
        level: 'verbose',
        debug: /FileSystemInfo/,
      }
    }

    if (logDefault || profile) {
      webpack5Config.plugins!.push((compiler: webpack.Compiler) => {
        compiler.hooks.done.tap('next-webpack-logging', (stats) => {
          console.log(
            stats.toString({
              colors: true,
              logging: logDefault ? 'log' : 'verbose',
            })
          )
        })
      })
    } else if (summary) {
      webpack5Config.plugins!.push((compiler: webpack.Compiler) => {
        compiler.hooks.done.tap('next-webpack-logging', (stats) => {
          console.log(
            stats.toString({
              preset: 'summary',
              colors: true,
              timings: true,
            })
          )
        })
      })
    }

    if (profile) {
      const ProgressPlugin =
        webpack.ProgressPlugin as unknown as typeof webpack.ProgressPlugin
      webpack5Config.plugins!.push(
        new ProgressPlugin({
          profile: true,
        })
      )
      webpack5Config.profile = true
    }
  }

  webpackConfig = await buildConfiguration(webpackConfig, {
    supportedBrowsers,
    rootDirectory: dir,
    customAppFile: pagesDir
      ? new RegExp(escapeStringRegexp(path.join(pagesDir, `_app`)))
      : undefined,
    hasAppDir,
    isDevelopment: dev,
    isServer: isNodeServer || isEdgeServer,
    isEdgeRuntime: isEdgeServer,
    targetWeb: isClient || isEdgeServer,
    assetPrefix: config.assetPrefix || '',
    sassOptions: config.sassOptions,
    productionBrowserSourceMaps: config.productionBrowserSourceMaps,
    future: config.future,
    experimental: config.experimental,
    disableStaticImages: config.images.disableStaticImages,
    transpilePackages: config.transpilePackages,
  })

  // @ts-ignore Cache exists
  webpackConfig.cache.name = `${webpackConfig.name}-${webpackConfig.mode}${
    isDevFallback ? '-fallback' : ''
  }`

  let originalDevtool = webpackConfig.devtool
  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {
      dir,
      dev,
      isServer: isNodeServer || isEdgeServer,
      buildId,
      config,
      defaultLoaders,
      totalPages: Object.keys(entrypoints).length,
      webpack,
      ...(isNodeServer || isEdgeServer
        ? {
            nextRuntime: isEdgeServer ? 'edge' : 'nodejs',
          }
        : {}),
    })

    if (!webpackConfig) {
      throw new Error(
        `Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your ${config.configFileName}.\n` +
          'See more info here https://nextjs.org/docs/messages/undefined-webpack-config'
      )
    }

    if (dev && originalDevtool !== webpackConfig.devtool) {
      webpackConfig.devtool = originalDevtool
      devtoolRevertWarning(originalDevtool)
    }

    // eslint-disable-next-line @typescript-eslint/no-shadow
    const webpack5Config = webpackConfig as webpack.Configuration

    // disable lazy compilation of entries as next.js has it's own method here
    if (webpack5Config.experiments?.lazyCompilation === true) {
      webpack5Config.experiments.lazyCompilation = {
        entries: false,
      }
    } else if (
      typeof webpack5Config.experiments?.lazyCompilation === 'object' &&
      webpack5Config.experiments.lazyCompilation.entries !== false
    ) {
      webpack5Config.experiments.lazyCompilation.entries = false
    }

    if (typeof (webpackConfig as any).then === 'function') {
      console.warn(
        '> Promise returned in next config. https://nextjs.org/docs/messages/promise-in-next-config'
      )
    }
  }

  if (!config.images.disableStaticImages) {
    const rules = webpackConfig.module?.rules || []
    const hasCustomSvg = rules.some(
      (rule) =>
        rule &&
        typeof rule === 'object' &&
        rule.loader !== 'next-image-loader' &&
        'test' in rule &&
        rule.test instanceof RegExp &&
        rule.test.test('.svg')
    )
    const nextImageRule = rules.find(
      (rule) =>
        rule && typeof rule === 'object' && rule.loader === 'next-image-loader'
    )
    if (
      hasCustomSvg &&
      nextImageRule &&
      nextImageRule &&
      typeof nextImageRule === 'object'
    ) {
      // Exclude svg if the user already defined it in custom
      // webpack config such as `@svgr/webpack` plugin or
      // the `babel-plugin-inline-react-svg` plugin.
      nextImageRule.test = /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp)$/i
    }
  }

  if (
    config.experimental.craCompat &&
    webpackConfig.module?.rules &&
    webpackConfig.plugins
  ) {
    // CRA allows importing non-webpack handled files with file-loader
    // these need to be the last rule to prevent catching other items
    // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L594
    const fileLoaderExclude = [/\.(js|mjs|jsx|ts|tsx|json)$/]
    const fileLoader = {
      exclude: fileLoaderExclude,
      issuer: fileLoaderExclude,
      type: 'asset/resource',
    }

    const topRules = []
    const innerRules = []

    for (const rule of webpackConfig.module.rules) {
      if (!rule || typeof rule !== 'object') continue
      if (rule.resolve) {
        topRules.push(rule)
      } else {
        if (
          rule.oneOf &&
          !(rule.test || rule.exclude || rule.resource || rule.issuer)
        ) {
          rule.oneOf.forEach((r) => innerRules.push(r))
        } else {
          innerRules.push(rule)
        }
      }
    }

    webpackConfig.module.rules = [
      ...(topRules as any),
      {
        oneOf: [...innerRules, fileLoader],
      },
    ]
  }

  // Backwards compat with webpack-dev-middleware options object
  if (typeof config.webpackDevMiddleware === 'function') {
    const options = config.webpackDevMiddleware({
      watchOptions: webpackConfig.watchOptions,
    })
    if (options.watchOptions) {
      webpackConfig.watchOptions = options.watchOptions
    }
  }

  function canMatchCss(rule: webpack.RuleSetCondition | undefined): boolean {
    if (!rule) {
      return false
    }

    const fileNames = [
      '/tmp/NEXTJS_CSS_DETECTION_FILE.css',
      '/tmp/NEXTJS_CSS_DETECTION_FILE.scss',
      '/tmp/NEXTJS_CSS_DETECTION_FILE.sass',
      '/tmp/NEXTJS_CSS_DETECTION_FILE.less',
      '/tmp/NEXTJS_CSS_DETECTION_FILE.styl',
    ]

    if (rule instanceof RegExp && fileNames.some((input) => rule.test(input))) {
      return true
    }

    if (typeof rule === 'function') {
      if (
        fileNames.some((input) => {
          try {
            if (rule(input)) {
              return true
            }
          } catch (_) {}
          return false
        })
      ) {
        return true
      }
    }

    if (Array.isArray(rule) && rule.some(canMatchCss)) {
      return true
    }

    return false
  }

  const hasUserCssConfig =
    webpackConfig.module?.rules?.some(
      (rule: any) => canMatchCss(rule.test) || canMatchCss(rule.include)
    ) ?? false

  if (hasUserCssConfig) {
    // only show warning for one build
    if (isNodeServer || isEdgeServer) {
      console.warn(
        chalk.yellow.bold('Warning: ') +
          chalk.bold(
            'Built-in CSS support is being disabled due to custom CSS configuration being detected.\n'
          ) +
          'See here for more info: https://nextjs.org/docs/messages/built-in-css-disabled\n'
      )
    }

    if (webpackConfig.module?.rules?.length) {
      // Remove default CSS Loaders
      webpackConfig.module.rules.forEach((r) => {
        if (!r || typeof r !== 'object') return
        if (Array.isArray(r.oneOf)) {
          r.oneOf = r.oneOf.filter(
            (o) => (o as any)[Symbol.for('__next_css_remove')] !== true
          )
        }
      })
    }
    if (webpackConfig.plugins?.length) {
      // Disable CSS Extraction Plugin
      webpackConfig.plugins = webpackConfig.plugins.filter(
        (p) => (p as any).__next_css_remove !== true
      )
    }
    if (webpackConfig.optimization?.minimizer?.length) {
      // Disable CSS Minifier
      webpackConfig.optimization.minimizer =
        webpackConfig.optimization.minimizer.filter(
          (e) => (e as any).__next_css_remove !== true
        )
    }
  }

  // Inject missing React Refresh loaders so that development mode is fast:
  if (dev && isClient) {
    attachReactRefresh(webpackConfig, defaultLoaders.babel)
  }

  // check if using @zeit/next-typescript and show warning
  if (
    (isNodeServer || isEdgeServer) &&
    webpackConfig.module &&
    Array.isArray(webpackConfig.module.rules)
  ) {
    let foundTsRule = false

    webpackConfig.module.rules = webpackConfig.module.rules.filter(
      (rule): boolean => {
        if (!rule || typeof rule !== 'object') return true
        if (!(rule.test instanceof RegExp)) return true
        if (rule.test.test('noop.ts') && !rule.test.test('noop.js')) {
          // remove if it matches @zeit/next-typescript
          foundTsRule = rule.use === defaultLoaders.babel
          return !foundTsRule
        }
        return true
      }
    )

    if (foundTsRule) {
      console.warn(
        `\n@zeit/next-typescript is no longer needed since Next.js has built-in support for TypeScript now. Please remove it from your ${config.configFileName} and your .babelrc\n`
      )
    }
  }

  // Patch `@zeit/next-sass`, `@zeit/next-less`, `@zeit/next-stylus` for compatibility
  if (webpackConfig.module && Array.isArray(webpackConfig.module.rules)) {
    ;[].forEach.call(
      webpackConfig.module.rules,
      function (rule: webpack.RuleSetRule) {
        if (!(rule.test instanceof RegExp && Array.isArray(rule.use))) {
          return
        }

        const isSass =
          rule.test.source === '\\.scss$' || rule.test.source === '\\.sass$'
        const isLess = rule.test.source === '\\.less$'
        const isCss = rule.test.source === '\\.css$'
        const isStylus = rule.test.source === '\\.styl$'

        // Check if the rule we're iterating over applies to Sass, Less, or CSS
        if (!(isSass || isLess || isCss || isStylus)) {
          return
        }

        ;[].forEach.call(rule.use, function (use: webpack.RuleSetUseItem) {
          if (
            !(
              use &&
              typeof use === 'object' &&
              // Identify use statements only pertaining to `css-loader`
              (use.loader === 'css-loader' ||
                use.loader === 'css-loader/locals') &&
              use.options &&
              typeof use.options === 'object' &&
              // The `minimize` property is a good heuristic that we need to
              // perform this hack. The `minimize` property was only valid on
              // old `css-loader` versions. Custom setups (that aren't next-sass,
              // next-less or next-stylus) likely have the newer version.
              // We still handle this gracefully below.
              (Object.prototype.hasOwnProperty.call(use.options, 'minimize') ||
                Object.prototype.hasOwnProperty.call(
                  use.options,
                  'exportOnlyLocals'
                ))
            )
          ) {
            return
          }

          // Try to monkey patch within a try-catch. We shouldn't fail the build
          // if we cannot pull this off.
          // The user may not even be using the `next-sass` or `next-less` or
          // `next-stylus` plugins.
          // If it does work, great!
          try {
            // Resolve the version of `@zeit/next-css` as depended on by the Sass,
            // Less or Stylus plugin.
            const correctNextCss = require.resolve('@zeit/next-css', {
              paths: [
                isCss
                  ? // Resolve `@zeit/next-css` from the base directory
                    dir
                  : // Else, resolve it from the specific plugins
                    require.resolve(
                      isSass
                        ? '@zeit/next-sass'
                        : isLess
                        ? '@zeit/next-less'
                        : isStylus
                        ? '@zeit/next-stylus'
                        : 'next'
                    ),
              ],
            })

            // If we found `@zeit/next-css` ...
            if (correctNextCss) {
              // ... resolve the version of `css-loader` shipped with that
              // package instead of whichever was hoisted highest in your
              // `node_modules` tree.
              const correctCssLoader = require.resolve(use.loader, {
                paths: [correctNextCss],
              })
              if (correctCssLoader) {
                // We saved the user from a failed build!
                use.loader = correctCssLoader
              }
            }
          } catch (_) {
            // The error is not required to be handled.
          }
        })
      }
    )
  }

  // Backwards compat for `main.js` entry key
  // and setup of dependencies between entries
  // we can't do that in the initial entry for
  // backward-compat reasons
  const originalEntry: any = webpackConfig.entry
  if (typeof originalEntry !== 'undefined') {
    const updatedEntry = async () => {
      const entry: webpack.EntryObject =
        typeof originalEntry === 'function'
          ? await originalEntry()
          : originalEntry
      // Server compilation doesn't have main.js
      if (
        clientEntries &&
        Array.isArray(entry['main.js']) &&
        entry['main.js'].length > 0
      ) {
        const originalFile = clientEntries[
          CLIENT_STATIC_FILES_RUNTIME_MAIN
        ] as string
        entry[CLIENT_STATIC_FILES_RUNTIME_MAIN] = [
          ...entry['main.js'],
          originalFile,
        ]
      }
      delete entry['main.js']

      for (const name of Object.keys(entry)) {
        entry[name] = finalizeEntrypoint({
          value: entry[name],
          compilerType,
          name,
          hasAppDir,
        })
      }

      return entry
    }
    // @ts-ignore webpack 5 typings needed
    webpackConfig.entry = updatedEntry
  }

  if (!dev && typeof webpackConfig.entry === 'function') {
    // entry is always a function
    webpackConfig.entry = await webpackConfig.entry()
  }

  return webpackConfig
}
