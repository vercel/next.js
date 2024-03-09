import React from 'react'
import ReactRefreshWebpackPlugin from 'next/dist/compiled/@next/react-refresh-utils/dist/ReactRefreshWebpackPlugin'
import { yellow, bold } from '../lib/picocolors'
import crypto from 'crypto'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import path from 'path'
import semver from 'next/dist/compiled/semver'

import { escapeStringRegexp } from '../shared/lib/escape-regexp'
import { WEBPACK_LAYERS, WEBPACK_RESOURCE_QUERIES } from '../lib/constants'
import type { WebpackLayerName } from '../lib/constants'
import {
  isWebpackAppLayer,
  isWebpackClientOnlyLayer,
  isWebpackDefaultLayer,
  isWebpackServerOnlyLayer,
} from './utils'
import type { CustomRoutes } from '../lib/load-custom-routes.js'
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
} from '../shared/lib/constants'
import type { CompilerNameValues } from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import type { NextConfigComplete } from '../server/config-shared'
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
import loadJsConfig, {
  type JsConfig,
  type ResolvedBaseUrl,
} from './load-jsconfig'
import { loadBindings } from './swc'
import { AppBuildManifestPlugin } from './webpack/plugins/app-build-manifest-plugin'
import { SubresourceIntegrityPlugin } from './webpack/plugins/subresource-integrity-plugin'
import { NextFontManifestPlugin } from './webpack/plugins/next-font-manifest-plugin'
import { getSupportedBrowsers } from './utils'
import { MemoryWithGcCachePlugin } from './webpack/plugins/memory-with-gc-cache-plugin'
import { getBabelConfigFile } from './get-babel-config-file'
import { needsExperimentalReact } from '../lib/needs-experimental-react'
import { getDefineEnvPlugin } from './webpack/plugins/define-env-plugin'
import type { SWCLoaderOptions } from './webpack/loaders/next-swc-loader'
import { isResourceInPackages, makeExternalHandler } from './handle-externals'
import {
  getMainField,
  edgeConditionNames,
} from './webpack-config-rules/resolve'
import { OptionalPeerDependencyResolverPlugin } from './webpack/plugins/optional-peer-dependency-resolve-plugin'
import {
  createWebpackAliases,
  createServerOnlyClientOnlyAliases,
  createRSCAliases,
  createNextApiEsmAliases,
  createAppRouterApiAliases,
} from './create-compiler-aliases'
import { hasCustomExportOutput } from '../export/utils'
import { MergeCssChunksPlugin } from './webpack/plugins/merge-css-chunks-plugin'

type ExcludesFalse = <T>(x: T | false) => x is T
type ClientEntries = {
  [key: string]: string | string[]
}

const EXTERNAL_PACKAGES =
  require('../lib/server-external-packages.json') as string[]

export const NEXT_PROJECT_ROOT = path.join(__dirname, '..', '..')
export const NEXT_PROJECT_ROOT_DIST = path.join(NEXT_PROJECT_ROOT, 'dist')
const NEXT_PROJECT_ROOT_DIST_CLIENT = path.join(
  NEXT_PROJECT_ROOT_DIST,
  'client'
)

if (parseInt(React.version) < 18) {
  throw new Error('Next.js requires react >= 18.2.0 to be installed.')
}

export const babelIncludeRegexes: RegExp[] = [
  /next[\\/]dist[\\/](esm[\\/])?shared[\\/]lib/,
  /next[\\/]dist[\\/](esm[\\/])?client/,
  /next[\\/]dist[\\/](esm[\\/])?pages/,
  /[\\/](strip-ansi|ansi-regex|styled-jsx)[\\/]/,
]

const browserNonTranspileModules = [
  // Transpiling `process/browser` will trigger babel compilation error due to value replacement.
  // TypeError: Property left of AssignmentExpression expected node to be of a type ["LVal"] but instead got "BooleanLiteral"
  // e.g. `process.browser = true` will become `true = true`.
  /[\\/]node_modules[\\/]process[\\/]browser/,
  // Exclude precompiled react packages from browser compilation due to SWC helper insertion (#61791),
  // We fixed the issue but it's safer to exclude them from compilation since they don't need to be re-compiled.
  /[\\/]next[\\/]dist[\\/]compiled[\\/](react|react-dom|react-server-dom-webpack)(-experimental)?($|[\\/])/,
]
const precompileRegex = /[\\/]next[\\/]dist[\\/]compiled[\\/]/

const asyncStoragesRegex =
  /next[\\/]dist[\\/](esm[\\/])?client[\\/]components[\\/](static-generation-async-storage|action-async-storage|request-async-storage)/

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
const reactRefreshLoaderName =
  'next/dist/compiled/@next/react-refresh-utils/dist/loader'

export function attachReactRefresh(
  webpackConfig: webpack.Configuration,
  targetLoader: webpack.RuleSetUseItem
) {
  let injections = 0
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
}): Promise<{
  jsConfig: JsConfig
  resolvedBaseUrl: ResolvedBaseUrl
  supportedBrowsers: string[] | undefined
}> {
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

export function hasExternalOtelApiPackage(): boolean {
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
    resolvedBaseUrl: ResolvedBaseUrl
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
  const disableOptimizedLoading = true
  const enableTypedRoutes = !!config.experimental.typedRoutes && hasAppDir
  const bundledReactChannel = needsExperimentalReact(config)
    ? '-experimental'
    : ''

  const babelConfigFile = getBabelConfigFile(dir)

  if (!dev && hasCustomExportOutput(config)) {
    config.distDir = '.next'
  }
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
    await loadBindings(config.experimental.useWasmBinary)
  }

  if (!loggedIgnoredCompilerOptions && !useSWCLoader && config.compiler) {
    Log.info(
      '`compiler` options in `next.config.js` will be ignored while using Babel https://nextjs.org/docs/messages/ignored-compiler-options'
    )
    loggedIgnoredCompilerOptions = true
  }

  const babelLoader = (function getBabelLoader() {
    if (useSWCLoader) return undefined
    return {
      loader: require.resolve('./babel/loader/index'),
      options: {
        configFile: babelConfigFile,
        isServer: isNodeOrEdgeCompilation,
        distDir,
        pagesDir,
        cwd: dir,
        development: dev,
        hasReactRefresh: dev && isClient,
        hasJsxRuntime: true,
      },
    }
  })()

  let swcTraceProfilingInitialized = false
  const getSwcLoader = (extraOptions: Partial<SWCLoaderOptions>) => {
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
        nextConfig: config,
        jsConfig,
        transpilePackages: config.transpilePackages,
        supportedBrowsers,
        swcCacheDir: path.join(dir, config?.distDir ?? '.next', 'cache', 'swc'),
        ...extraOptions,
      } satisfies SWCLoaderOptions,
    }
  }

  // RSC loaders, prefer ESM, set `esm` to true
  const swcServerLayerLoader = getSwcLoader({
    serverComponents: true,
    bundleLayer: WEBPACK_LAYERS.reactServerComponents,
    esm: true,
  })
  const swcSSRLayerLoader = getSwcLoader({
    serverComponents: true,
    bundleLayer: WEBPACK_LAYERS.serverSideRendering,
    esm: true,
  })
  const swcBrowserLayerLoader = getSwcLoader({
    serverComponents: true,
    bundleLayer: WEBPACK_LAYERS.appPagesBrowser,
    esm: true,
  })
  // Default swc loaders for pages doesn't prefer ESM.
  const swcDefaultLoader = getSwcLoader({
    serverComponents: true,
    esm: false,
  })

  const defaultLoaders = {
    babel: useSWCLoader ? swcDefaultLoader : babelLoader!,
  }

  const appServerLayerLoaders = hasAppDir
    ? [
        // When using Babel, we will have to add the SWC loader
        // as an additional pass to handle RSC correctly.
        // This will cause some performance overhead but
        // acceptable as Babel will not be recommended.
        swcServerLayerLoader,
        babelLoader,
      ].filter(Boolean)
    : []

  const instrumentLayerLoaders = [
    // When using Babel, we will have to add the SWC loader
    // as an additional pass to handle RSC correctly.
    // This will cause some performance overhead but
    // acceptable as Babel will not be recommended.
    swcServerLayerLoader,
    babelLoader,
  ].filter(Boolean)

  const middlewareLayerLoaders = [
    // When using Babel, we will have to use SWC to do the optimization
    // for middleware to tree shake the unused default optimized imports like "next/server".
    // This will cause some performance overhead but
    // acceptable as Babel will not be recommended.
    getSwcLoader({
      serverComponents: false,
      bundleLayer: WEBPACK_LAYERS.middleware,
    }),
    babelLoader,
  ].filter(Boolean)

  const reactRefreshLoaders =
    dev && isClient ? [require.resolve(reactRefreshLoaderName)] : []

  // client components layers: SSR or browser
  const createClientLayerLoader = ({
    isBrowserLayer,
    reactRefresh,
  }: {
    isBrowserLayer: boolean
    reactRefresh: boolean
  }) => [
    ...(reactRefresh ? reactRefreshLoaders : []),
    {
      // This loader handles actions and client entries
      // in the client layer.
      loader: 'next-flight-client-module-loader',
    },
    ...(hasAppDir
      ? [
          // When using Babel, we will have to add the SWC loader
          // as an additional pass to handle RSC correctly.
          // This will cause some performance overhead but
          // acceptable as Babel will not be recommended.
          isBrowserLayer ? swcBrowserLayerLoader : swcSSRLayerLoader,
          babelLoader,
        ].filter(Boolean)
      : []),
  ]

  const appBrowserLayerLoaders = createClientLayerLoader({
    isBrowserLayer: true,
    // reactRefresh for browser layer is applied conditionally to user-land source
    reactRefresh: false,
  })
  const appSSRLayerLoaders = createClientLayerLoader({
    isBrowserLayer: false,
    reactRefresh: true,
  })

  // Loader for API routes needs to be differently configured as it shouldn't
  // have RSC transpiler enabled, so syntax checks such as invalid imports won't
  // be performed.
  const apiRoutesLayerLoaders =
    hasAppDir && useSWCLoader
      ? getSwcLoader({
          serverComponents: false,
          bundleLayer: WEBPACK_LAYERS.api,
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

  const resolveConfig: webpack.Configuration['resolve'] = {
    // Disable .mjs for node_modules bundling
    extensions: ['.js', '.mjs', '.tsx', '.ts', '.jsx', '.json', '.wasm'],
    extensionAlias: config.experimental.extensionAlias,
    modules: [
      'node_modules',
      ...nodePathList, // Support for NODE_PATH environment variable
    ],
    alias: createWebpackAliases({
      distDir,
      isClient,
      isEdgeServer,
      isNodeServer,
      dev,
      config,
      pagesDir,
      appDir,
      dir,
      reactProductionProfiling,
      hasRewrites,
    }),
    ...(isClient || isEdgeServer
      ? {
          fallback: {
            process: require.resolve('./polyfills/process'),
          },
        }
      : undefined),
    // default main fields use pages dir ones, and customize app router ones in loaders.
    mainFields: getMainField(compilerType, false),
    ...(isEdgeServer && {
      conditionNames: edgeConditionNames,
    }),
    plugins: [
      isNodeServer ? new OptionalPeerDependencyResolverPlugin() : undefined,
    ].filter(Boolean) as webpack.ResolvePluginInstance[],
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
  const nextFrameworkPaths: string[] = []
  const topLevelFrameworkPaths: string[] = []
  const visitedFrameworkPackages = new Set<string>()
  // Adds package-paths of dependencies recursively
  const addPackagePath = (
    packageName: string,
    relativeToPath: string,
    paths: string[]
  ) => {
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
      if (paths.includes(directory)) return
      paths.push(directory)
      const dependencies = require(packageJsonPath).dependencies || {}
      for (const name of Object.keys(dependencies)) {
        addPackagePath(name, directory, paths)
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
    addPackagePath(packageName, dir, topLevelFrameworkPaths)
  }
  addPackagePath('next', dir, nextFrameworkPaths)

  const crossOrigin = config.crossOrigin

  // The `serverComponentsExternalPackages` should not conflict with
  // the `transpilePackages`.
  if (
    config.experimental.serverComponentsExternalPackages &&
    config.transpilePackages
  ) {
    const externalPackageConflicts = config.transpilePackages.filter((pkg) =>
      config.experimental.serverComponentsExternalPackages?.includes(pkg)
    )
    if (externalPackageConflicts.length > 0) {
      throw new Error(
        `The packages specified in the 'transpilePackages' conflict with the 'serverComponentsExternalPackages': ${externalPackageConflicts.join(
          ', '
        )}`
      )
    }
  }

  // For original request, such as `package name`
  const optOutBundlingPackages = EXTERNAL_PACKAGES.concat(
    ...(config.experimental.serverComponentsExternalPackages || [])
  ).filter((pkg) => !config.transpilePackages?.includes(pkg))
  // For resolved request, such as `absolute path/package name/foo/bar.js`
  const optOutBundlingPackageRegex = new RegExp(
    `[/\\\\]node_modules[/\\\\](${optOutBundlingPackages
      .map((p) => p.replace(/\//g, '[/\\\\]'))
      .join('|')})[/\\\\]`
  )

  const transpilePackagesRegex = new RegExp(
    `[/\\\\]node_modules[/\\\\](${config.transpilePackages
      ?.map((p) => p.replace(/\//g, '[/\\\\]'))
      .join('|')})[/\\\\]`
  )

  const handleExternals = makeExternalHandler({
    config,
    optOutBundlingPackages,
    optOutBundlingPackageRegex,
    dir,
  })

  const shouldIncludeExternalDirs =
    config.experimental.externalDir || !!config.transpilePackages

  const codeCondition = {
    test: { or: [/\.(tsx|ts|js|cjs|mjs|jsx)$/, /__barrel_optimize__/] },
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
        // server chunking
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

        if (isNodeServer || isEdgeServer) {
          return {
            filename: `${isEdgeServer ? 'edge-chunks/' : ''}[name].js`,
            chunks: 'all',
            minChunks: 2,
          }
        }

        const frameworkCacheGroup = {
          chunks: 'all' as const,
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
        }

        const libCacheGroup = {
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
        }

        // client chunking
        const cssCacheGroup = {
          test: /\.(css|sass|scss)$/i,
          chunks: 'all' as const,
          enforce: true,
          type: /css/,
          minChunks: 2,
          priority: 100,
        }
        return {
          // Keep main and _app chunks unsplitted in webpack 5
          // as we don't need a separate vendor chunk from that
          // and all other chunk depend on them so there is no
          // duplication that need to be pulled out.
          chunks: (chunk: any) =>
            !/^(polyfills|main|pages\/_app)$/.test(chunk.name),
          cacheGroups: appDir
            ? {
                css: cssCacheGroup,
                framework: frameworkCacheGroup,
                lib: libCacheGroup,
              }
            : {
                framework: frameworkCacheGroup,
                lib: libCacheGroup,
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
        // Alias server-only and client-only to proper exports based on bundling layers
        {
          issuerLayer: {
            or: [
              ...WEBPACK_LAYERS.GROUP.serverOnly,
              ...WEBPACK_LAYERS.GROUP.nonClientServerTarget,
            ],
          },
          resolve: {
            // Error on client-only but allow server-only
            alias: createServerOnlyClientOnlyAliases(true),
          },
        },
        {
          issuerLayer: {
            not: [
              ...WEBPACK_LAYERS.GROUP.serverOnly,
              ...WEBPACK_LAYERS.GROUP.nonClientServerTarget,
            ],
          },
          resolve: {
            // Error on server-only but allow client-only
            alias: createServerOnlyClientOnlyAliases(false),
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
            or: WEBPACK_LAYERS.GROUP.serverOnly,
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
              ...WEBPACK_LAYERS.GROUP.serverOnly,
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
                issuerLayer: isWebpackAppLayer,
                resolve: {
                  alias: createNextApiEsmAliases(),
                },
              },
              {
                issuerLayer: isWebpackServerOnlyLayer,
                resolve: {
                  alias: createAppRouterApiAliases(true),
                },
              },
              {
                issuerLayer: isWebpackClientOnlyLayer,
                resolve: {
                  alias: createAppRouterApiAliases(false),
                },
              },
            ]
          : []),
        ...(hasAppDir && !isClient
          ? [
              {
                issuerLayer: isWebpackServerOnlyLayer,
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
                  mainFields: getMainField(compilerType, true),
                  conditionNames: reactServerCondition,
                  // If missing the alias override here, the default alias will be used which aliases
                  // react to the direct file path, not the package name. In that case the condition
                  // will be ignored completely.
                  alias: createRSCAliases(bundledReactChannel, {
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
        ...(hasAppDir
          ? [
              {
                // Alias react-dom for ReactDOM.preload usage.
                // Alias react for switching between default set and share subset.
                oneOf: [
                  {
                    exclude: asyncStoragesRegex,
                    issuerLayer: isWebpackServerOnlyLayer,
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
                    reactProductionProfiling,
                    layer: WEBPACK_LAYERS.appPagesBrowser,
                    isEdgeServer,
                  }),
                },
              },
            ]
          : []),
        // Do not apply react-refresh-loader to node_modules for app router browser layer
        ...(hasAppDir && dev && isClient
          ? [
              {
                test: codeCondition.test,
                exclude: [
                  // exclude unchanged modules from react-refresh
                  codeCondition.exclude,
                  transpilePackagesRegex,
                  precompileRegex,
                ],
                issuerLayer: WEBPACK_LAYERS.appPagesBrowser,
                use: reactRefreshLoaders,
                resolve: {
                  mainFields: getMainField(compilerType, true),
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
              use: apiRoutesLayerLoaders,
            },
            {
              test: codeCondition.test,
              issuerLayer: WEBPACK_LAYERS.middleware,
              use: middlewareLayerLoaders,
            },
            {
              test: codeCondition.test,
              issuerLayer: WEBPACK_LAYERS.instrument,
              use: instrumentLayerLoaders,
            },
            ...(hasAppDir
              ? [
                  {
                    test: codeCondition.test,
                    issuerLayer: isWebpackServerOnlyLayer,
                    exclude: asyncStoragesRegex,
                    use: appServerLayerLoaders,
                  },
                  {
                    test: codeCondition.test,
                    resourceQuery: new RegExp(
                      WEBPACK_RESOURCE_QUERIES.edgeSSREntry
                    ),
                    use: appServerLayerLoaders,
                  },
                  {
                    test: codeCondition.test,
                    issuerLayer: WEBPACK_LAYERS.appPagesBrowser,
                    // Exclude the transpilation of the app layer due to compilation issues
                    exclude: browserNonTranspileModules,
                    use: appBrowserLayerLoaders,
                    resolve: {
                      mainFields: getMainField(compilerType, true),
                    },
                  },
                  {
                    test: codeCondition.test,
                    issuerLayer: WEBPACK_LAYERS.serverSideRendering,
                    use: appSSRLayerLoaders,
                    resolve: {
                      mainFields: getMainField(compilerType, true),
                    },
                  },
                ]
              : []),
            {
              ...codeCondition,
              use: [...reactRefreshLoaders, defaultLoaders.babel],
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
          test: /[\\/]next[\\/]dist[\\/](esm[\\/])?server[\\/]og[\\/]image-response\.js/,
          sideEffects: false,
        },
        {
          // This loader rule should be before other rules, as it can output code
          // that still contains `"use client"` or `"use server"` statements that
          // needs to be re-transformed by the RSC compilers.
          // This loader rule works like a bridge between user's import and
          // the target module behind a package's barrel file. It reads SWC's
          // analysis result from the previous loader, and directly returns the
          // code that only exports values that are asked by the user.
          test: /__barrel_optimize__/,
          use: ({ resourceQuery }: { resourceQuery: string }) => {
            const names = (
              resourceQuery.match(/\?names=([^&]+)/)?.[1] || ''
            ).split(',')

            return [
              {
                loader: 'next-barrel-loader',
                options: {
                  names,
                  swcCacheDir: path.join(
                    dir,
                    config?.distDir ?? '.next',
                    'cache',
                    'swc'
                  ),
                },
                // This is part of the request value to serve as the module key.
                // The barrel loader are no-op re-exported modules keyed by
                // export names.
                ident: 'next-barrel-loader:' + resourceQuery,
              },
            ]
          },
        },
      ],
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
        isTurbopack: false,
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
            optOutBundlingPackages,
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
            const { NextJsRequireCacheHotReloader } =
              require('./webpack/plugins/nextjs-require-cache-hot-reloader') as typeof import('./webpack/plugins/nextjs-require-cache-hot-reloader')
            const devPlugins: any[] = [
              new NextJsRequireCacheHotReloader({
                serverComponents: hasAppDir,
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
          rewrites,
        }),
      isClient &&
        new BuildManifestPlugin({
          buildId,
          rewrites,
          isDevFallback,
          exportRuntime: true,
          appDirEnabled: hasAppDir,
        }),
      new ProfilingPlugin({ runWebpackSpan, rootDir: dir }),
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
      hasAppDir &&
        (isClient
          ? new ClientReferenceManifestPlugin({
              dev,
              appDir,
            })
          : new FlightClientEntryPlugin({
              appDir,
              dev,
              isEdgeServer,
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
        config.experimental.mergeCssChunks &&
        new MergeCssChunksPlugin(),
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
  // Only add the baseUrl if it's explicitly set in tsconfig/jsconfig
  if (resolvedBaseUrl && !resolvedBaseUrl.isImplicit) {
    webpackConfig.resolve?.modules?.push(resolvedBaseUrl.baseUrl)
  }

  // always add JsConfigPathsPlugin to allow hot-reloading
  // if the config is added/removed
  webpackConfig.resolve?.plugins?.unshift(
    new JsConfigPathsPlugin(
      jsConfig?.compilerOptions?.paths || {},
      resolvedBaseUrl
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
    if (!hasAppDir) {
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
    //  - Next.js location on disk (some loaders use absolute paths and some resolve options depend on absolute paths)
    //  - Next.js version
    //  - next.config.js keys that affect compilation
    version: `${__dirname}|${process.env.__NEXT_VERSION}|${configVars}`,
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
