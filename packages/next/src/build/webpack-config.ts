import React from 'react'
import ReactRefreshWebpackPlugin from 'next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin'
import { yellow, bold } from '../lib/picocolors'
import crypto from 'crypto'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'
import semver from 'next/dist/compiled/semver'

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
  WEBPACK_RESOURCE_QUERIES,
  WebpackLayerName,
} from '../lib/constants'
import { isWebpackDefaultLayer, isWebpackServerLayer } from './utils'
import { CustomRoutes } from '../lib/load-custom-routes.js'
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
import { FlightClientEntryPlugin } from './webpack/plugins/flight-client-entry-plugin'
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
import { MemoryWithGcCachePlugin } from './webpack/plugins/memory-with-gc-cache-plugin'
import { getBabelConfigFile } from './get-babel-config-file'
import { defaultOverrides } from '../server/require-hook'
import { needsExperimentalReact } from '../lib/needs-experimental-react'
import { getDefineEnvPlugin } from './webpack/plugins/define-env-plugin'
import { SWCLoaderOptions } from './webpack/loaders/next-swc-loader'
import { isResourceInPackages, makeExternalHandler } from './handle-externals'

type ExcludesFalse = <T>(x: T | false) => x is T
type ClientEntries = {
  [key: string]: string | string[]
}

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

const asyncStoragesRegex =
  /next[\\/]dist[\\/](esm[\\/])?client[\\/]components[\\/](static-generation-async-storage|action-async-storage|request-async-storage)/

// exports.<conditionName>
const edgeConditionNames = [
  'edge-light',
  'worker',
  // inherits the default conditions
  '...',
]

// packageJson.<mainField>
const mainFieldsPerCompiler: Record<CompilerNameValues, string[]> = {
  [COMPILER_NAMES.server]: ['main', 'module'],
  [COMPILER_NAMES.client]: ['browser', 'module', 'main'],
  [COMPILER_NAMES.edgeServer]: edgeConditionNames,
}

// Support for NODE_PATH
const nodePathList = (process.env.NODE_PATH || '')
  .split(process.platform === 'win32' ? ';' : ':')
  .filter((p) => !!p)

const watchOptions = Object.freeze({
  aggregateTimeout: 5,
  ignored:
    // Matches **/node_modules/**, **/.git/** and **/.next/**
    /^((?:[^/]*(?:\/|$))*)(\.(git|next)|node_modules)(\/((?:[^/]*(?:\/|$))*)(?:$|\/))?/,
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

function getReactProfilingInProduction() {
  return {
    'react-dom$': 'react-dom/profiling',
    'scheduler/tracing': 'scheduler/tracing-profiling',
  }
}

function createRSCAliases(
  bundledReactChannel: string,
  opts: {
    layer: WebpackLayerName
    isEdgeServer: boolean
    reactProductionProfiling: boolean
    reactServerCondition?: boolean
  }
) {
  let alias: Record<string, string> = {
    react$: `next/dist/compiled/react${bundledReactChannel}`,
    'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}`,
    'react/jsx-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-runtime`,
    'react/jsx-dev-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-dev-runtime`,
    'react-dom/client$': `next/dist/compiled/react-dom${bundledReactChannel}/client`,
    'react-dom/server$': `next/dist/compiled/react-dom${bundledReactChannel}/server`,
    'react-dom/server.edge$': `next/dist/compiled/react-dom${bundledReactChannel}/server.edge`,
    'react-dom/server.browser$': `next/dist/compiled/react-dom${bundledReactChannel}/server.browser`,
    'react-server-dom-webpack/client$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client`,
    'react-server-dom-webpack/client.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client.edge`,
    'react-server-dom-webpack/server.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.edge`,
    'react-server-dom-webpack/server.node$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.node`,
  }

  if (!opts.isEdgeServer) {
    if (opts.layer === WEBPACK_LAYERS.serverSideRendering) {
      alias = Object.assign(alias, {
        'react/jsx-runtime$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-jsx-runtime`,
        'react/jsx-dev-runtime$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-jsx-dev-runtime`,
        react$: `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react`,
        'react-dom$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-dom`,
        'react-server-dom-webpack/client.edge$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-server-dom-webpack-client-edge`,
      })
    } else if (opts.layer === WEBPACK_LAYERS.reactServerComponents) {
      alias = Object.assign(alias, {
        'react/jsx-runtime$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-jsx-runtime`,
        'react/jsx-dev-runtime$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-jsx-dev-runtime`,
        react$: `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react`,
        'react-dom$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-dom`,
        'react-server-dom-webpack/server.edge$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-server-dom-webpack-server-edge`,
        'react-server-dom-webpack/server.node$': `next/dist/server/future/route-modules/app-page/vendored/${opts.layer}/react-server-dom-webpack-server-node`,
      })
    }
  }

  if (opts.isEdgeServer) {
    if (opts.layer === WEBPACK_LAYERS.reactServerComponents) {
      alias[
        'react$'
      ] = `next/dist/compiled/react${bundledReactChannel}/react.shared-subset`
    }
    // Use server rendering stub for RSC and SSR
    // x-ref: https://github.com/facebook/react/pull/25436
    alias[
      'react-dom$'
    ] = `next/dist/compiled/react-dom${bundledReactChannel}/server-rendering-stub`
  }

  if (opts.reactProductionProfiling) {
    alias[
      'react-dom$'
    ] = `next/dist/compiled/react-dom${bundledReactChannel}/profiling`
    alias[
      'scheduler/tracing'
    ] = `next/dist/compiled/scheduler${bundledReactChannel}/tracing-profiling`
  }

  alias[
    '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client.ts'
  ] = `next/dist/client/dev/noop-turbopack-hmr`

  return alias
}

const devtoolRevertWarning = execOnce(
  (devtool: webpack.Configuration['devtool']) => {
    console.warn(
      yellow(bold('Warning: ')) +
        bold(`Reverting webpack devtool to '${devtool}'.\n`) +
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
  return {
    unfetch$: stubWindowFetch,
    'isomorphic-unfetch$': stubWindowFetch,
    'whatwg-fetch$': path.join(
      __dirname,
      'polyfills',
      'fetch',
      'whatwg-fetch.js'
    ),
    'object-assign$': stubObjectAssign,
    // Stub Package: object.assign
    'object.assign/auto': path.join(shimAssign, 'auto.js'),
    'object.assign/implementation': path.join(shimAssign, 'implementation.js'),
    'object.assign$': path.join(shimAssign, 'index.js'),
    'object.assign/polyfill': path.join(shimAssign, 'polyfill.js'),
    'object.assign/shim': path.join(shimAssign, 'shim.js'),

    // Replace: full URL polyfill with platform-based polyfill
    url: require.resolve('next/dist/compiled/native-url'),
  }
}

// Alias these modules to be resolved with "module" if possible.
function getBarrelOptimizationAliases(packages: string[]) {
  const aliases: { [pkg: string]: string } = {}
  const mainFields = ['module', 'main']

  for (const pkg of packages) {
    try {
      const descriptionFileData = require(`${pkg}/package.json`)
      const descriptionFilePath = require.resolve(`${pkg}/package.json`)

      for (const field of mainFields) {
        if (descriptionFileData.hasOwnProperty(field)) {
          aliases[pkg + '$'] = path.join(
            path.dirname(descriptionFilePath),
            descriptionFileData[field]
          )
          break
        }
      }
    } catch {}
  }

  return aliases
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
  const supportedBrowsers = await getSupportedBrowsers(dir, dev)
  return {
    jsConfig,
    resolvedBaseUrl,
    supportedBrowsers,
  }
}

function getOpenTelemetryVersion(): string | null {
  try {
    return require('@opentelemetry/api/package.json')?.version ?? null
  } catch {
    return null
  }
}

function hasExternalOtelApiPackage(): boolean {
  const opentelemetryVersion = getOpenTelemetryVersion()
  if (!opentelemetryVersion) {
    return false
  }

  // 0.19.0 is the first version of the package that has the `tracer.getSpan` API that we need:
  // https://github.com/vercel/next.js/issues/48118
  if (semver.gte(opentelemetryVersion, '0.19.0')) {
    return true
  } else {
    throw new Error(
      `Installed "@opentelemetry/api" with version ${opentelemetryVersion} is not supported by Next.js. Please upgrade to 0.19.0 or newer version.`
    )
  }
}

const UNSAFE_CACHE_REGEX = /[\\/]pages[\\/][^\\/]+(?:$|\?|#)/

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

  // If the current compilation is aimed at server-side code instead of client-side code.
  const isNodeOrEdgeCompilation = isNodeServer || isEdgeServer

  const hasRewrites =
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0

  const hasAppDir = !!appDir
  const hasServerComponents = hasAppDir
  const disableOptimizedLoading = true
  const enableTypedRoutes = !!config.experimental.typedRoutes && hasAppDir
  const useServerActions = !!config.experimental.serverActions && hasAppDir
  const bundledReactChannel = needsExperimentalReact(config)
    ? '-experimental'
    : ''

  const babelConfigFile = getBabelConfigFile(dir)
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
        isServer: isNodeOrEdgeCompilation,
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
  const getSwcLoader = (
    extraOptions: Partial<SWCLoaderOptions> & {
      bundleTarget: SWCLoaderOptions['bundleTarget']
      isServerLayer: SWCLoaderOptions['isServerLayer']
    }
  ) => {
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
        isServer: isNodeOrEdgeCompilation,
        rootDir: dir,
        pagesDir,
        appDir,
        hasReactRefresh: dev && isClient,
        hasServerComponents: true,
        nextConfig: config,
        jsConfig,
        supportedBrowsers,
        swcCacheDir: path.join(dir, config?.distDir ?? '.next', 'cache', 'swc'),
        ...extraOptions,
      } satisfies SWCLoaderOptions,
    }
  }

  const defaultLoaders = {
    babel: useSWCLoader
      ? getSwcLoader({ bundleTarget: 'client', isServerLayer: false })
      : getBabelLoader(),
  }

  const swcLoaderForServerLayer = hasServerComponents
    ? useSWCLoader
      ? [getSwcLoader({ isServerLayer: true, bundleTarget: 'server' })]
      : // When using Babel, we will have to add the SWC loader
        // as an additional pass to handle RSC correctly.
        // This will cause some performance overhead but
        // acceptable as Babel will not be recommended.
        [
          getSwcLoader({ isServerLayer: true, bundleTarget: 'server' }),
          getBabelLoader(),
        ]
    : []

  const swcLoaderForMiddlewareLayer = useSWCLoader
    ? getSwcLoader({
        isServerLayer: false,
        hasServerComponents: false,
        bundleTarget: 'default',
      })
    : // When using Babel, we will have to use SWC to do the optimization
      // for middleware to tree shake the unused default optimized imports like "next/server".
      // This will cause some performance overhead but
      // acceptable as Babel will not be recommended.
      [
        getSwcLoader({
          isServerLayer: false,
          hasServerComponents: false,
          bundleTarget: 'default',
        }),
        getBabelLoader(),
      ]

  // client components layers: SSR + browser
  const swcLoaderForClientLayer = [
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
    ...(hasServerComponents
      ? useSWCLoader
        ? [
            getSwcLoader({
              hasServerComponents,
              isServerLayer: false,
              bundleTarget: 'client',
            }),
          ]
        : // When using Babel, we will have to add the SWC loader
          // as an additional pass to handle RSC correctly.
          // This will cause some performance overhead but
          // acceptable as Babel will not be recommended.
          [
            getSwcLoader({
              isServerLayer: false,
              bundleTarget: 'client',
            }),
            getBabelLoader(),
          ]
      : []),
  ]

  // Loader for API routes needs to be differently configured as it shouldn't
  // have RSC transpiler enabled, so syntax checks such as invalid imports won't
  // be performed.
  const loaderForAPIRoutes =
    hasServerComponents && useSWCLoader
      ? getSwcLoader({
          isServerLayer: false,
          bundleTarget: 'default',
          hasServerComponents: false,
        })
      : defaultLoaders.babel

  const pageExtensions = config.pageExtensions

  const outputPath = isNodeOrEdgeCompilation
    ? path.join(distDir, SERVER_DIRECTORY)
    : distDir

  const reactServerCondition = [
    'react-server',
    ...(isEdgeServer ? edgeConditionNames : []),
    // inherits the default conditions
    '...',
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
      } satisfies ClientEntries)
    : undefined

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
    const nextDistPath = 'next/dist/' + (isEdgeServer ? 'esm/' : '')
    customAppAliases[`${PAGES_DIR_ALIAS}/_app`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_app.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_app.js`,
    ]
    customAppAliases[`${PAGES_DIR_ALIAS}/_error`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_error.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_error.js`,
    ]
    customDocumentAliases[`${PAGES_DIR_ALIAS}/_document`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_document.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_document.js`,
    ]
  }

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
      // Alias 3rd party @vercel/og package to vendored og image package to reduce bundle size
      '@vercel/og': 'next/dist/server/web/spec-extension/image-response',

      // Alias next/dist imports to next/dist/esm assets,
      // let this alias hit before `next` alias.
      ...(isEdgeServer
        ? {
            'next/dist/build': 'next/dist/esm/build',
            'next/dist/client': 'next/dist/esm/client',
            'next/dist/shared': 'next/dist/esm/shared',
            'next/dist/pages': 'next/dist/esm/pages',
            'next/dist/lib': 'next/dist/esm/lib',
            'next/dist/server': 'next/dist/esm/server',

            // Alias the usage of next public APIs
            [`${NEXT_PROJECT_ROOT}/server`]:
              'next/dist/esm/server/web/exports/index',
            [`${NEXT_PROJECT_ROOT}/dist/client/link`]:
              'next/dist/esm/client/link',
            [`${NEXT_PROJECT_ROOT}/dist/shared/lib/image-external`]:
              'next/dist/esm/shared/lib/image-external',
            [`${NEXT_PROJECT_ROOT}/dist/client/script`]:
              'next/dist/esm/client/script',
            [`${NEXT_PROJECT_ROOT}/dist/client/router`]:
              'next/dist/esm/client/router',
            [`${NEXT_PROJECT_ROOT}/dist/shared/lib/head`]:
              'next/dist/esm/shared/lib/head',
            [`${NEXT_PROJECT_ROOT}/dist/shared/lib/dynamic`]:
              'next/dist/esm/shared/lib/dynamic',
            [`${NEXT_PROJECT_ROOT}/dist/pages/_document`]:
              'next/dist/esm/pages/_document',
            [`${NEXT_PROJECT_ROOT}/dist/pages/_app`]:
              'next/dist/esm/pages/_app',
            [`${NEXT_PROJECT_ROOT}/dist/client/components/navigation`]:
              'next/dist/esm/client/components/navigation',
            [`${NEXT_PROJECT_ROOT}/dist/client/components/headers`]:
              'next/dist/esm/client/components/headers',
          }
        : undefined),

      // For RSC server bundle
      ...(!hasExternalOtelApiPackage() && {
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

      'styled-jsx/style$': defaultOverrides['styled-jsx/style'],
      'styled-jsx$': defaultOverrides['styled-jsx'],

      ...customAppAliases,
      ...customErrorAlias,
      ...customDocumentAliases,
      ...customRootAliases,

      ...(pagesDir ? { [PAGES_DIR_ALIAS]: pagesDir } : {}),
      ...(appDir ? { [APP_DIR_ALIAS]: appDir } : {}),
      [ROOT_DIR_ALIAS]: dir,
      [DOT_NEXT_ALIAS]: distDir,
      ...(isClient || isEdgeServer ? getOptimizedAliases() : {}),
      ...(reactProductionProfiling ? getReactProfilingInProduction() : {}),

      // For Node server, we need to re-alias the package imports to prefer to
      // resolve to the ESM export.
      ...(isNodeServer
        ? getBarrelOptimizationAliases(
            config.experimental.optimizePackageImports || []
          )
        : {}),

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
      conditionNames: edgeConditionNames,
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

  for (const packageName of [
    'react',
    'react-dom',
    ...(hasAppDir
      ? [
          `next/dist/compiled/react${bundledReactChannel}`,
          `next/dist/compiled/react-dom${bundledReactChannel}`,
        ]
      : []),
  ]) {
    addPackagePath(packageName, dir)
  }

  const crossOrigin = config.crossOrigin

  const optOutBundlingPackages = EXTERNAL_PACKAGES.concat(
    ...(config.experimental.serverComponentsExternalPackages || [])
  )
  const optOutBundlingPackageRegex = new RegExp(
    `[/\\\\]node_modules[/\\\\](${optOutBundlingPackages
      .map((p) => p.replace(/\//g, '[/\\\\]'))
      .join('|')})[/\\\\]`
  )

  const handleExternals = makeExternalHandler({
    config,
    optOutBundlingPackageRegex,
    dir,
    hasAppDir,
  })

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
                contextInfo.issuerLayer as WebpackLayerName,
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
          if (isNodeServer) {
            /*
              In development, we want to split code that comes from `node_modules` into their own chunks.
              This is because in development, we often need to reload the user bundle due to changes in the code.
              To work around this, we put all the vendor code into separate chunks so that we don't need to reload them.
              This is safe because the vendor code doesn't change between reloads.
            */
            const extractRootNodeModule = (modulePath: string) => {
              // This regex is used to extract the root node module name to be used as the chunk group name.
              // example: ../../node_modules/.pnpm/next@10/foo/node_modules/bar -> next@10
              const regex =
                /node_modules(?:\/|\\)\.?(?:pnpm(?:\/|\\))?([^/\\]+)/
              const match = modulePath.match(regex)
              return match ? match[1] : null
            }
            return {
              cacheGroups: {
                // this chunk configuration gives us a separate chunk for each top level module in node_modules
                // or a hashed chunk if we can't extract the module name.
                vendor: {
                  chunks: 'all',
                  reuseExistingChunk: true,
                  test: /[\\/]node_modules[\\/]/,
                  minSize: 0,
                  minChunks: 1,
                  maxAsyncRequests: 300,
                  maxInitialRequests: 300,
                  name: (module: webpack.Module) => {
                    const moduleId = module.nameForCondition()!
                    const rootModule = extractRootNodeModule(moduleId)
                    if (rootModule) {
                      return `vendor-chunks/${rootModule}`
                    } else {
                      const hash = crypto.createHash('sha1').update(moduleId)
                      hash.update(moduleId)
                      return `vendor-chunks/${hash.digest('hex')}`
                    }
                  },
                },
                // disable the default chunk groups
                default: false,
                defaultVendors: false,
              },
            }
          }

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
              // Ensures the framework chunk is not created for App Router.
              layer: isWebpackDefaultLayer,
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
                layer: string | null | undefined
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

                // Ensures the name of the chunk is not the same between two modules in different layers
                // E.g. if you import 'button-library' in App Router and Pages Router we don't want these to be bundled in the same chunk
                // as they're never used on the same page.
                if (module.layer) {
                  hash.update(module.layer)
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
      minimize:
        !dev &&
        (isClient ||
          isEdgeServer ||
          (isNodeServer && config.experimental.serverMinification)),
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
      publicPath: `${
        config.assetPrefix
          ? config.assetPrefix.endsWith('/')
            ? config.assetPrefix.slice(0, -1)
            : config.assetPrefix
          : ''
      }/_next/`,
      path: !dev && isNodeServer ? path.join(outputPath, 'chunks') : outputPath,
      // On the server we don't use hashes
      filename: isNodeOrEdgeCompilation
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
      chunkFilename: isNodeOrEdgeCompilation
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
        'empty-loader',
        'next-middleware-loader',
        'next-edge-function-loader',
        'next-edge-app-route-loader',
        'next-edge-ssr-loader',
        'next-middleware-asset-loader',
        'next-middleware-wasm-loader',
        'next-app-loader',
        'next-route-loader',
        'next-font-loader',
        'next-invalid-import-error-loader',
        'next-metadata-route-loader',
        'modularize-import-loader',
        'next-barrel-loader',
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
        {
          // This loader rule passes the resource to the SWC loader with
          // `optimizeBarrelExports` enabled. This option makes the SWC to
          // transform the original code to be a JSON of its export map, so
          // the barrel loader can analyze it and only keep the needed ones.
          test: /__barrel_transform__/,
          use: ({ resourceQuery }: { resourceQuery: string }) => {
            const isFromWildcardExport = /[&?]wildcard/.test(resourceQuery)

            return [
              getSwcLoader({
                isServerLayer: false,
                bundleTarget: 'client',
                hasServerComponents: false,
                optimizeBarrelExports: {
                  wildcard: isFromWildcardExport,
                },
              }),
            ]
          },
        },
        {
          // This loader rule works like a bridge between user's import and
          // the target module behind a package's barrel file. It reads SWC's
          // analysis result from the previous loader, and directly returns the
          // code that only exports values that are asked by the user.
          test: /__barrel_optimize__/,
          use: ({ resourceQuery }: { resourceQuery: string }) => {
            const names = (
              resourceQuery.match(/\?names=([^&]+)/)?.[1] || ''
            ).split(',')
            const isFromWildcardExport = /[&?]wildcard/.test(resourceQuery)

            return [
              {
                loader: 'next-barrel-loader',
                options: {
                  names,
                  wildcard: isFromWildcardExport,
                },
                // This is part of the request value to serve as the module key.
                // The barrel loader are no-op re-exported modules keyed by
                // export names.
                ident: 'next-barrel-loader:' + resourceQuery,
              },
            ]
          },
        },
        // Alias server-only and client-only to proper exports based on bundling layers
        {
          issuerLayer: {
            or: [
              ...WEBPACK_LAYERS.GROUP.server,
              ...WEBPACK_LAYERS.GROUP.nonClientServerTarget,
            ],
          },
          resolve: {
            // Error on client-only but allow server-only
            alias: {
              'server-only$': 'next/dist/compiled/server-only/empty',
              'client-only$': 'next/dist/compiled/client-only/error',
              'next/dist/compiled/server-only$':
                'next/dist/compiled/server-only/empty',
              'next/dist/compiled/client-only$':
                'next/dist/compiled/client-only/error',
            },
          },
        },
        {
          issuerLayer: {
            not: [
              ...WEBPACK_LAYERS.GROUP.server,
              ...WEBPACK_LAYERS.GROUP.nonClientServerTarget,
            ],
          },
          resolve: {
            // Error on server-only but allow client-only
            alias: {
              'server-only$': 'next/dist/compiled/server-only/index',
              'client-only$': 'next/dist/compiled/client-only/index',
              'next/dist/compiled/client-only$':
                'next/dist/compiled/client-only/index',
              'next/dist/compiled/server-only':
                'next/dist/compiled/server-only/index',
            },
          },
        },
        // Detect server-only / client-only imports and error in build time
        {
          test: [
            /^client-only$/,
            /next[\\/]dist[\\/]compiled[\\/]client-only[\\/]error/,
          ],
          loader: 'next-invalid-import-error-loader',
          issuerLayer: {
            or: WEBPACK_LAYERS.GROUP.server,
          },
          options: {
            message:
              "'client-only' cannot be imported from a Server Component module. It should only be used from a Client Component.",
          },
        },
        {
          test: [
            /^server-only$/,
            /next[\\/]dist[\\/]compiled[\\/]server-only[\\/]index/,
          ],
          loader: 'next-invalid-import-error-loader',
          issuerLayer: {
            not: [
              ...WEBPACK_LAYERS.GROUP.server,
              ...WEBPACK_LAYERS.GROUP.nonClientServerTarget,
            ],
          },
          options: {
            message:
              "'server-only' cannot be imported from a Client Component module. It should only be used from a Server Component.",
          },
        },
        // Potential the bundle introduced into middleware and api can be poisoned by client-only
        // but not being used, so we disabled the `client-only` erroring on these layers.
        // `server-only` is still available.
        {
          test: [
            /^client-only$/,
            /next[\\/]dist[\\/]compiled[\\/]client-only[\\/]error/,
          ],
          loader: 'empty-loader',
          issuerLayer: {
            or: WEBPACK_LAYERS.GROUP.nonClientServerTarget,
          },
        },
        ...(hasAppDir
          ? [
              {
                layer: WEBPACK_LAYERS.appRouteHandler,
                test: new RegExp(
                  `private-next-app-dir\\/.*\\/route\\.(${pageExtensions.join(
                    '|'
                  )})$`
                ),
              },
              {
                // Make sure that AsyncLocalStorage module instance is shared between server and client
                // layers.
                layer: WEBPACK_LAYERS.shared,
                test: asyncStoragesRegex,
              },
              // Convert metadata routes to separate layer
              {
                resourceQuery: new RegExp(
                  WEBPACK_RESOURCE_QUERIES.metadataRoute
                ),
                layer: WEBPACK_LAYERS.appMetadataRoute,
              },
              {
                // Ensure that the app page module is in the client layers, this
                // enables React to work correctly for RSC.
                layer: WEBPACK_LAYERS.serverSideRendering,
                test: /next[\\/]dist[\\/](esm[\\/])?server[\\/]future[\\/]route-modules[\\/]app-page[\\/]module/,
              },
              {
                // All app dir layers need to use this configured resolution logic
                issuerLayer: {
                  or: [
                    WEBPACK_LAYERS.reactServerComponents,
                    WEBPACK_LAYERS.serverSideRendering,
                    WEBPACK_LAYERS.appPagesBrowser,
                    WEBPACK_LAYERS.actionBrowser,
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
                  },
                },
              },
            ]
          : []),
        ...(hasAppDir && !isClient
          ? [
              {
                issuerLayer: isWebpackServerLayer,
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
                  // If missing the alias override here, the default alias will be used which aliases
                  // react to the direct file path, not the package name. In that case the condition
                  // will be ignored completely.
                  alias: createRSCAliases(bundledReactChannel, {
                    reactServerCondition: true,
                    // No server components profiling
                    reactProductionProfiling,
                    layer: WEBPACK_LAYERS.reactServerComponents,
                    isEdgeServer,
                  }),
                },
                use: {
                  loader: 'next-flight-loader',
                },
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
                resourceQuery: new RegExp(
                  WEBPACK_RESOURCE_QUERIES.edgeSSREntry
                ),
                layer: WEBPACK_LAYERS.reactServerComponents,
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
                    issuerLayer: isWebpackServerLayer,
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
                      alias: createRSCAliases(bundledReactChannel, {
                        reactServerCondition: true,
                        reactProductionProfiling,
                        layer: WEBPACK_LAYERS.reactServerComponents,
                        isEdgeServer,
                      }),
                    },
                  },
                  {
                    test: codeCondition.test,
                    issuerLayer: WEBPACK_LAYERS.serverSideRendering,
                    resolve: {
                      alias: createRSCAliases(bundledReactChannel, {
                        reactServerCondition: false,
                        reactProductionProfiling,
                        layer: WEBPACK_LAYERS.serverSideRendering,
                        isEdgeServer,
                      }),
                    },
                  },
                ],
              },
              {
                test: codeCondition.test,
                issuerLayer: WEBPACK_LAYERS.appPagesBrowser,
                resolve: {
                  alias: createRSCAliases(bundledReactChannel, {
                    // Only alias server rendering stub in client SSR layer.
                    // reactSharedSubset: false,
                    // reactDomServerRenderingStub: false,
                    reactServerCondition: false,
                    reactProductionProfiling,
                    // browser: isClient,
                    layer: WEBPACK_LAYERS.appPagesBrowser,
                    isEdgeServer,
                  }),
                },
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
              test: codeCondition.test,
              issuerLayer: WEBPACK_LAYERS.middleware,
              use: swcLoaderForMiddlewareLayer,
            },
            ...(hasServerComponents
              ? [
                  {
                    test: codeCondition.test,
                    issuerLayer: isWebpackServerLayer,
                    exclude: [asyncStoragesRegex],
                    use: swcLoaderForServerLayer,
                  },
                  {
                    test: codeCondition.test,
                    resourceQuery: new RegExp(
                      WEBPACK_RESOURCE_QUERIES.edgeSSREntry
                    ),
                    use: swcLoaderForServerLayer,
                  },
                  {
                    ...codeCondition,
                    issuerLayer: [
                      WEBPACK_LAYERS.appPagesBrowser,
                      WEBPACK_LAYERS.serverSideRendering,
                    ],
                    exclude: [codeCondition.exclude],
                    use: swcLoaderForClientLayer,
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
                resourceQuery: {
                  not: [
                    new RegExp(WEBPACK_RESOURCE_QUERIES.metadata),
                    new RegExp(WEBPACK_RESOURCE_QUERIES.metadataRoute),
                    new RegExp(WEBPACK_RESOURCE_QUERIES.metadataImageMeta),
                  ],
                },
                options: {
                  isDev: dev,
                  compilerType,
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
          // Mark `image-response.js` as side-effects free to make sure we can
          // tree-shake it if not used.
          test: /[\\/]next[\\/]dist[\\/](esm[\\/])?server[\\/]web[\\/]exports[\\/]image-response\.js/,
          sideEffects: false,
        },
      ].filter(Boolean),
    },
    plugins: [
      isNodeServer &&
        new webpack.NormalModuleReplacementPlugin(
          /\.\/(.+)\.shared-runtime$/,
          function (resource) {
            const moduleName = path.basename(
              resource.request,
              '.shared-runtime'
            )
            const layer = resource.contextInfo.issuerLayer

            let runtime

            switch (layer) {
              case WEBPACK_LAYERS.appRouteHandler:
                runtime = 'app-route'
                break
              case WEBPACK_LAYERS.serverSideRendering:
              case WEBPACK_LAYERS.reactServerComponents:
              case WEBPACK_LAYERS.appPagesBrowser:
              case WEBPACK_LAYERS.actionBrowser:
                runtime = 'app-page'
                break
              default:
                runtime = 'pages'
            }

            resource.request = `next/dist/server/future/route-modules/${runtime}/vendored/contexts/${moduleName}`
          }
        ),
      dev && new MemoryWithGcCachePlugin({ maxGenerations: 5 }),
      dev && isClient && new ReactRefreshWebpackPlugin(webpack),
      // Makes sure `Buffer` and `process` are polyfilled in client and flight bundles (same behavior as webpack 4)
      (isClient || isEdgeServer) &&
        new webpack.ProvidePlugin({
          // Buffer is used by getInlineScriptSource
          Buffer: [require.resolve('buffer'), 'Buffer'],
          // Avoid process being overridden when in web run time
          ...(isClient && { process: [require.resolve('process')] }),
        }),
      getDefineEnvPlugin({
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
      }),
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
      isNodeOrEdgeCompilation &&
        new PagesManifestPlugin({
          dev,
          appDirEnabled: hasAppDir,
          isEdgeRuntime: isEdgeServer,
          distDir: !dev ? distDir : undefined,
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
          : new FlightClientEntryPlugin({
              appDir,
              dev,
              isEdgeServer,
              useServerActions,
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
          appDir,
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
    imageLoaderFile: config.images.loaderFile,
  })

  const cache: any = {
    type: 'filesystem',
    // Disable memory cache in development in favor of our own MemoryWithGcCachePlugin.
    maxMemoryGenerations: dev ? 0 : Infinity, // Infinity is default value for production in webpack currently.
    // Includes:
    //  - Next.js version
    //  - next.config.js keys that affect compilation
    version: `${process.env.__NEXT_VERSION}|${configVars}`,
    cacheDirectory: path.join(distDir, 'cache', 'webpack'),
    // For production builds, it's more efficient to compress all cache files together instead of compression each one individually.
    // So we disable compression here and allow the build runner to take care of compressing the cache as a whole.
    // For local development, we still want to compress the cache files individually to avoid I/O bottlenecks
    // as we are seeing 1~10 seconds of fs I/O time from user reports.
    compression: dev ? 'gzip' : false,
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
      (profileClient && isClient) || (profileServer && isNodeOrEdgeCompilation)
    const summary =
      (summaryClient && isClient) || (summaryServer && isNodeOrEdgeCompilation)

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
    isServer: isNodeOrEdgeCompilation,
    isEdgeRuntime: isEdgeServer,
    targetWeb: isClient || isEdgeServer,
    assetPrefix: config.assetPrefix || '',
    sassOptions: config.sassOptions,
    productionBrowserSourceMaps: config.productionBrowserSourceMaps,
    future: config.future,
    experimental: config.experimental,
    disableStaticImages: config.images.disableStaticImages,
    transpilePackages: config.transpilePackages,
    serverSourceMaps: config.experimental.serverSourceMaps,
  })

  // @ts-ignore Cache exists
  webpackConfig.cache.name = `${webpackConfig.name}-${webpackConfig.mode}${
    isDevFallback ? '-fallback' : ''
  }`

  if (dev) {
    if (webpackConfig.module) {
      webpackConfig.module.unsafeCache = (module: any) =>
        !UNSAFE_CACHE_REGEX.test(module.resource)
    } else {
      webpackConfig.module = {
        unsafeCache: (module: any) => !UNSAFE_CACHE_REGEX.test(module.resource),
      }
    }
  }

  let originalDevtool = webpackConfig.devtool
  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {
      dir,
      dev,
      isServer: isNodeOrEdgeCompilation,
      buildId,
      config,
      defaultLoaders,
      totalPages: Object.keys(entrypoints).length,
      webpack,
      ...(isNodeOrEdgeCompilation
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
          } catch {}
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
    if (isNodeOrEdgeCompilation) {
      console.warn(
        yellow(bold('Warning: ')) +
          bold(
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
