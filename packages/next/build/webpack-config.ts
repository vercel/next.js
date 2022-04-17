import ReactRefreshWebpackPlugin from 'next/dist/compiled/@next/react-refresh-utils/ReactRefreshWebpackPlugin'
import chalk from 'next/dist/compiled/chalk'
import crypto from 'crypto'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import path, { join as pathJoin, relative as relativePath } from 'path'
import { escapeStringRegexp } from '../shared/lib/escape-regexp'
import {
  DOT_NEXT_ALIAS,
  NEXT_PROJECT_ROOT,
  NEXT_PROJECT_ROOT_DIST_CLIENT,
  PAGES_DIR_ALIAS,
  MIDDLEWARE_ROUTE,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { CustomRoutes } from '../lib/load-custom-routes.js'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  MIDDLEWARE_REACT_LOADABLE_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import { NextConfigComplete } from '../server/config-shared'
import { finalizeEntrypoint } from './entries'
import * as Log from './output/log'
import { build as buildConfiguration } from './webpack/config'
import MiddlewarePlugin from './webpack/plugins/middleware-plugin'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import { TraceEntryPointsPlugin } from './webpack/plugins/next-trace-entrypoints-plugin'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import { WellKnownErrorsPlugin } from './webpack/plugins/wellknown-errors-plugin'
import { regexLikeCss } from './webpack/config/blocks/css'
import { CopyFilePlugin } from './webpack/plugins/copy-file-plugin'
import { FlightManifestPlugin } from './webpack/plugins/flight-manifest-plugin'
import {
  Feature,
  SWC_TARGET_TRIPLE,
  TelemetryPlugin,
} from './webpack/plugins/telemetry-plugin'
import type { Span } from '../trace'
import { getRawPageExtensions } from './utils'
import browserslist from 'next/dist/compiled/browserslist'
import loadJsConfig from './load-jsconfig'
import { getMiddlewareSourceMapPlugins } from './webpack/plugins/middleware-source-maps-plugin'

const watchOptions = Object.freeze({
  aggregateTimeout: 5,
  ignored: ['**/.git/**', '**/.next/**'],
})

function getSupportedBrowsers(
  dir: string,
  isDevelopment: boolean
): string[] | undefined {
  let browsers: any
  try {
    browsers = browserslist.loadConfig({
      path: dir,
      env: isDevelopment ? 'development' : 'production',
    })
  } catch {}
  return browsers
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
    'next/dist/compiled/@next/react-refresh-utils/loader'
  const reactRefreshLoader = require.resolve(reactRefreshLoaderName)
  webpackConfig.module?.rules.forEach((rule) => {
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
  appDir: string,
  esmExternalsConfig: NextConfigComplete['experimental']['esmExternals'],
  context: string,
  request: string,
  isEsmRequested: boolean,
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
        ;[baseRes, baseIsEsm] = await baseResolve(appDir, request)
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

export default async function getBaseWebpackConfig(
  dir: string,
  {
    buildId,
    config,
    dev = false,
    isServer = false,
    isEdgeRuntime = false,
    pagesDir,
    target = 'server',
    reactProductionProfiling = false,
    entrypoints,
    rewrites,
    isDevFallback = false,
    runWebpackSpan,
    hasReactRoot,
  }: {
    buildId: string
    config: NextConfigComplete
    dev?: boolean
    isServer?: boolean
    isEdgeRuntime?: boolean
    pagesDir: string
    target?: string
    reactProductionProfiling?: boolean
    entrypoints: webpack5.EntryObject
    rewrites: CustomRoutes['rewrites']
    isDevFallback?: boolean
    runWebpackSpan: Span
    hasReactRoot: boolean
  }
): Promise<webpack.Configuration> {
  const { useTypeScript, jsConfig, resolvedBaseUrl } = await loadJsConfig(
    dir,
    config
  )
  const supportedBrowsers = await getSupportedBrowsers(dir, dev)
  const hasRewrites =
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0
  const hasReactRefresh: boolean = dev && !isServer

  const runtime = config.experimental.runtime

  // Make sure `reactRoot` is enabled when React 18 or experimental is detected.
  if (hasReactRoot) {
    config.experimental.reactRoot = true
  }

  // Only inform during one of the builds
  if (!isServer && config.experimental.reactRoot && !hasReactRoot) {
    // It's fine to only mention React 18 here as we don't recommend people to try experimental.
    Log.warn('You have to use React 18 to use `experimental.reactRoot`.')
  }
  if (!isServer && runtime && !hasReactRoot) {
    throw new Error(
      '`experimental.runtime` requires `experimental.reactRoot` to be enabled along with React 18.'
    )
  }
  if (config.experimental.serverComponents && !hasReactRoot) {
    throw new Error(
      '`experimental.serverComponents` requires React 18 to be installed.'
    )
  }

  const targetWeb = isEdgeRuntime || !isServer
  const hasConcurrentFeatures = hasReactRoot
  const hasServerComponents =
    hasConcurrentFeatures && !!config.experimental.serverComponents
  const disableOptimizedLoading = hasConcurrentFeatures
    ? true
    : config.experimental.disableOptimizedLoading

  if (!isServer) {
    if (runtime === 'edge') {
      Log.warn(
        'You are using the experimental Edge Runtime with `experimental.runtime`.'
      )
    }
    if (runtime === 'nodejs') {
      Log.warn(
        'You are using the experimental Node.js Runtime with `experimental.runtime`.'
      )
    }
    if (hasServerComponents) {
      Log.warn(
        'You have experimental React Server Components enabled. Continue at your own risk.'
      )
    }
  }

  const babelConfigFile = await [
    '.babelrc',
    '.babelrc.json',
    '.babelrc.js',
    '.babelrc.mjs',
    '.babelrc.cjs',
    'babel.config.js',
    'babel.config.json',
    'babel.config.mjs',
    'babel.config.cjs',
  ].reduce(async (memo: Promise<string | undefined>, filename) => {
    const configFilePath = path.join(dir, filename)
    return (
      (await memo) ||
      ((await fileExists(configFilePath)) ? configFilePath : undefined)
    )
  }, Promise.resolve(undefined))

  const distDir = path.join(dir, config.distDir)

  let useSWCLoader = !babelConfigFile
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

  if (!loggedIgnoredCompilerOptions && !useSWCLoader && config.compiler) {
    Log.info(
      '`compiler` options in `next.config.js` will be ignored while using Babel https://nextjs.org/docs/messages/ignored-compiler-options'
    )
    loggedIgnoredCompilerOptions = true
  }

  const getBabelOrSwcLoader = (isMiddleware: boolean) => {
    return useSWCLoader
      ? {
          loader: 'next-swc-loader',
          options: {
            isServer: isMiddleware || isServer,
            pagesDir,
            hasReactRefresh: !isMiddleware && hasReactRefresh,
            fileReading: config.experimental.swcFileReading,
            nextConfig: config,
            jsConfig,
          },
        }
      : {
          loader: require.resolve('./babel/loader/index'),
          options: {
            configFile: babelConfigFile,
            isServer: isMiddleware ? true : isServer,
            distDir,
            pagesDir,
            cwd: dir,
            development: dev,
            hasReactRefresh: isMiddleware ? false : hasReactRefresh,
            hasJsxRuntime: true,
          },
        }
  }

  const defaultLoaders = {
    babel: getBabelOrSwcLoader(false),
  }

  const rawPageExtensions = hasServerComponents
    ? getRawPageExtensions(config.pageExtensions)
    : config.pageExtensions

  const serverComponentsRegex = new RegExp(
    `\\.server\\.(${rawPageExtensions.join('|')})$`
  )

  const babelIncludeRegexes: RegExp[] = [
    /next[\\/]dist[\\/]shared[\\/]lib/,
    /next[\\/]dist[\\/]client/,
    /next[\\/]dist[\\/]pages/,
    /[\\/](strip-ansi|ansi-regex)[\\/]/,
  ]

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  // Intentionally not using isTargetLikeServerless helper
  const isLikeServerless = isServerless || isServerlessTrace

  const outputDir = isLikeServerless ? SERVERLESS_DIRECTORY : SERVER_DIRECTORY
  const outputPath = path.join(distDir, isServer ? outputDir : '')
  const totalPages = Object.keys(entrypoints).length
  const clientEntries = !isServer
    ? ({
        // Backwards compatibility
        'main.js': [],
        ...(dev
          ? {
              [CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH]: require.resolve(
                `next/dist/compiled/@next/react-refresh-utils/runtime`
              ),
              [CLIENT_STATIC_FILES_RUNTIME_AMP]:
                `./` +
                relativePath(
                  dir,
                  pathJoin(NEXT_PROJECT_ROOT_DIST_CLIENT, 'dev', 'amp-dev')
                ).replace(/\\/g, '/'),
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

  if (dev) {
    customAppAliases[`${PAGES_DIR_ALIAS}/_app`] = [
      ...rawPageExtensions.reduce((prev, ext) => {
        prev.push(path.join(pagesDir, `_app.${ext}`))
        return prev
      }, [] as string[]),
      'next/dist/pages/_app.js',
    ]
    customAppAliases[`${PAGES_DIR_ALIAS}/_app.server`] = [
      ...rawPageExtensions.reduce((prev, ext) => {
        prev.push(path.join(pagesDir, `_app.server.${ext}`))
        return prev
      }, [] as string[]),
      'next/dist/pages/_app.server.js',
    ]
    customAppAliases[`${PAGES_DIR_ALIAS}/_error`] = [
      ...config.pageExtensions.reduce((prev, ext) => {
        prev.push(path.join(pagesDir, `_error.${ext}`))
        return prev
      }, [] as string[]),
      'next/dist/pages/_error.js',
    ]
    customDocumentAliases[`${PAGES_DIR_ALIAS}/_document`] = [
      ...config.pageExtensions.reduce((prev, ext) => {
        prev.push(path.join(pagesDir, `_document.${ext}`))
        return prev
      }, [] as string[]),
      `next/dist/pages/_document.js`,
    ]
  }

  const resolveConfig = {
    // Disable .mjs for node_modules bundling
    extensions: !targetWeb
      ? [
          '.js',
          '.mjs',
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
          '.jsx',
          '.json',
          '.wasm',
        ]
      : [
          '.mjs',
          '.js',
          ...(useTypeScript ? ['.tsx', '.ts'] : []),
          '.jsx',
          '.json',
          '.wasm',
        ],
    modules: [
      'node_modules',
      ...nodePathList, // Support for NODE_PATH environment variable
    ],
    alias: {
      next: NEXT_PROJECT_ROOT,

      ...customAppAliases,
      ...customErrorAlias,
      ...customDocumentAliases,

      [PAGES_DIR_ALIAS]: pagesDir,
      [DOT_NEXT_ALIAS]: distDir,
      ...(targetWeb ? getOptimizedAliases() : {}),
      ...getReactProfilingInProduction(),

      ...(targetWeb
        ? {
            [clientResolveRewrites]: hasRewrites
              ? clientResolveRewrites
              : // With webpack 5 an alias can be pointed to false to noop
                false,
          }
        : {}),

      setimmediate: 'next/dist/compiled/setimmediate',
    },
    ...(targetWeb
      ? {
          // Full list of old polyfills is accessible here:
          // https://github.com/webpack/webpack/blob/2a0536cf510768111a3a6dceeb14cb79b9f59273/lib/ModuleNotFoundError.js#L13-L42
          fallback: {
            assert: require.resolve('next/dist/compiled/assert'),
            buffer: require.resolve('next/dist/compiled/buffer/'),
            constants: require.resolve(
              'next/dist/compiled/constants-browserify'
            ),
            crypto: require.resolve('next/dist/compiled/crypto-browserify'),
            domain: require.resolve('next/dist/compiled/domain-browser'),
            http: require.resolve('next/dist/compiled/stream-http'),
            https: require.resolve('next/dist/compiled/https-browserify'),
            os: require.resolve('next/dist/compiled/os-browserify'),
            path: require.resolve('next/dist/compiled/path-browserify'),
            punycode: require.resolve('next/dist/compiled/punycode'),
            process: require.resolve('./polyfills/process'),
            // Handled in separate alias
            querystring: require.resolve('next/dist/compiled/querystring-es3'),
            stream: require.resolve('next/dist/compiled/stream-browserify'),
            string_decoder: require.resolve(
              'next/dist/compiled/string_decoder'
            ),
            sys: require.resolve('next/dist/compiled/util/'),
            timers: require.resolve('next/dist/compiled/timers-browserify'),
            tty: require.resolve('next/dist/compiled/tty-browserify'),
            // Handled in separate alias
            // url: require.resolve('url/'),
            util: require.resolve('next/dist/compiled/util/'),
            vm: require.resolve('next/dist/compiled/vm-browserify'),
            zlib: require.resolve('next/dist/compiled/browserify-zlib'),
            events: require.resolve('next/dist/compiled/events/'),
            setImmediate: require.resolve('next/dist/compiled/setimmediate'),
          },
        }
      : undefined),
    mainFields: targetWeb
      ? (isEdgeRuntime ? [] : ['browser']).concat(['module', 'main'])
      : ['main', 'module'],
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
    mangle: { safari10: true },
    output: {
      ecma: 5,
      safari10: true,
      comments: false,
      // Fixes usage of Emoji and certain Regex
      ascii_only: true,
    },
  }

  const isModuleCSS = (module: { type: string }): boolean => {
    return (
      // mini-css-extract-plugin
      module.type === `css/mini-extract` ||
      // extract-css-chunks-webpack-plugin (old)
      module.type === `css/extract-chunks` ||
      // extract-css-chunks-webpack-plugin (new)
      module.type === `css/extract-css-chunks`
    )
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

  // Select appropriate SplitChunksPlugin config for this build
  const splitChunksConfig: webpack.Options.SplitChunksOptions | false = dev
    ? false
    : {
        // Keep main and _app chunks unsplitted in webpack 5
        // as we don't need a separate vendor chunk from that
        // and all other chunk depend on them so there is no
        // duplication that need to be pulled out.
        chunks: (chunk) =>
          !/^(polyfills|main|pages\/_app)$/.test(chunk.name) &&
          !MIDDLEWARE_ROUTE.test(chunk.name),
        cacheGroups: {
          framework: {
            chunks: (chunk: webpack.compilation.Chunk) =>
              !chunk.name?.match(MIDDLEWARE_ROUTE),
            name: 'framework',
            test(module) {
              const resource =
                module.nameForCondition && module.nameForCondition()
              if (!resource) {
                return false
              }
              return topLevelFrameworkPaths.some((packagePath) =>
                resource.startsWith(packagePath)
              )
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
          middleware: {
            chunks: (chunk: webpack.compilation.Chunk) =>
              chunk.name?.match(MIDDLEWARE_ROUTE),
            filename: 'server/middleware-chunks/[name].js',
            minChunks: 2,
            enforce: true,
          },
        },
        maxInitialRequests: 25,
        minSize: 20000,
      }

  const crossOrigin = config.crossOrigin
  const looseEsmExternals = config.experimental?.esmExternals === 'loose'

  async function handleExternals(
    context: string,
    request: string,
    dependencyType: string,
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

    // Relative requires don't need custom resolution, because they
    // are relative to requests we've already resolved here.
    // Absolute requires (require('/foo')) are extremely uncommon, but
    // also have no need for customization as they're already resolved.
    if (!isLocal) {
      if (/^(?:next$|react(?:$|\/))/.test(request)) {
        return `commonjs ${request}`
      }

      const notExternalModules =
        /^(?:private-next-pages\/|next\/(?:dist\/pages\/|(?:app|document|link|image|constants|dynamic)$)|string-hash$)/
      if (notExternalModules.test(request)) {
        return
      }
    }

    // When in esm externals mode, and using import, we resolve with
    // ESM resolving options.
    const isEsmRequested = dependencyType === 'esm'

    const isLocalCallback = (localRes: string) => {
      // Makes sure dist/shared and dist/server are not bundled
      // we need to process shared `router/router` and `dynamic`,
      // so that the DefinePlugin can inject process.env values
      const isNextExternal =
        /next[/\\]dist[/\\](shared|server)[/\\](?!lib[/\\](router[/\\]router|dynamic))/.test(
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
      } else {
        // We don't want to retry local requests
        // with other preferEsm options
        return
      }
    }

    const resolveResult = await resolveExternal(
      dir,
      config.experimental.esmExternals,
      context,
      request,
      isEsmRequested,
      getResolve,
      isLocal ? isLocalCallback : undefined
    )

    if ('localRes' in resolveResult) {
      return resolveResult.localRes
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
      res.match(/next[/\\]dist[/\\]shared[/\\](?!lib[/\\]router[/\\]router)/) ||
      res.match(/next[/\\]dist[/\\]compiled[/\\].*\.[mc]?js$/)
    ) {
      return `${externalType} ${request}`
    }

    // Default pages have to be transpiled
    if (
      res.match(/[/\\]next[/\\]dist[/\\]/) ||
      // This is the @babel/plugin-transform-runtime "helpers: true" option
      res.match(/node_modules[/\\]@babel[/\\]runtime[/\\]/)
    ) {
      return
    }

    // Webpack itself has to be compiled because it doesn't always use module relative paths
    if (
      res.match(/node_modules[/\\]webpack/) ||
      res.match(/node_modules[/\\]css-loader/)
    ) {
      return
    }

    // Anything else that is standard JavaScript within `node_modules`
    // can be externalized.
    if (/node_modules[/\\].*\.[mc]?js$/.test(res)) {
      return `${externalType} ${request}`
    }

    // Default behavior: bundle the code!
  }

  const codeCondition = {
    test: /\.(tsx|ts|js|cjs|mjs|jsx)$/,
    ...(config.experimental.externalDir
      ? // Allowing importing TS/TSX files from outside of the root dir.
        {}
      : { include: [dir, ...babelIncludeRegexes] }),
    exclude: (excludePath: string) => {
      if (babelIncludeRegexes.some((r) => r.test(excludePath))) {
        return false
      }
      return /node_modules/.test(excludePath)
    },
  }

  const rscCodeCondition = {
    test: serverComponentsRegex,
    // only apply to the pages as the begin process of rsc loaders
    include: [dir, /next[\\/]dist[\\/]pages/],
  }

  let webpackConfig: webpack.Configuration = {
    parallelism: Number(process.env.NEXT_WEBPACK_PARALLELISM) || undefined,
    externals: targetWeb
      ? // make sure importing "next" is handled gracefully for client
        // bundles in case a user imported types and it wasn't removed
        // TODO: should we warn/error for this instead?
        [
          'next',
          ...(isEdgeRuntime
            ? [
                {
                  '@builder.io/partytown': '{}',
                  'next/dist/compiled/etag': '{}',
                  'next/dist/compiled/chalk': '{}',
                  'react-dom': '{}',
                },
              ]
            : []),
        ]
      : !isServerless
      ? [
          ({
            context,
            request,
            dependencyType,
            getResolve,
          }: {
            context: string
            request: string
            dependencyType: string
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
            handleExternals(context, request, dependencyType, (options) => {
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
                        ? resolveData?.descriptionFileData?.type === 'module'
                        : /\.mjs$/i.test(result)
                      resolve([result, isEsm])
                    }
                  )
                })
            }),
        ]
      : [
          // When the 'serverless' target is used all node_modules will be compiled into the output bundles
          // So that the 'serverless' bundles have 0 runtime dependencies
          'next/dist/compiled/@ampproject/toolbox-optimizer', // except this one

          // Mark this as external if not enabled so it doesn't cause a
          // webpack error from being missing
          ...(config.experimental.optimizeCss ? [] : ['critters']),
        ],
    optimization: {
      // @ts-ignore: TODO remove ts-ignore when webpack 4 is removed
      emitOnErrors: !dev,
      checkWasmTypes: false,
      nodeEnv: false,
      ...(hasServerComponents
        ? {
            // We have to use the names here instead of hashes to ensure the consistency between builds.
            moduleIds: 'named',
          }
        : {}),
      splitChunks: isServer
        ? dev
          ? false
          : ({
              filename: isEdgeRuntime ? 'chunks/[name].js' : '[name].js',
              // allow to split entrypoints
              chunks: ({ name }: any) => !name?.match(MIDDLEWARE_ROUTE),
              // size of files is not so relevant for server build
              // we want to prefer deduplication to load less code
              minSize: 1000,
            } as any)
        : splitChunksConfig,
      runtimeChunk: isServer
        ? undefined
        : { name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK },
      minimize: !dev && targetWeb,
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
            terserOptions,
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
    // @ts-ignore TODO webpack 5 typings needed
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
      path:
        isServer && !dev && !isEdgeRuntime
          ? path.join(outputPath, 'chunks')
          : outputPath,
      // On the server we don't use hashes
      filename: isServer
        ? !dev && !isEdgeRuntime
          ? `../[name].js`
          : `[name].js`
        : `static/chunks/${isDevFallback ? 'fallback/' : ''}[name]${
            dev ? '' : '-[contenthash]'
          }.js`,
      library: targetWeb ? '_N_E' : undefined,
      libraryTarget: targetWeb ? 'assign' : 'commonjs2',
      hotUpdateChunkFilename: 'static/webpack/[id].[fullhash].hot-update.js',
      hotUpdateMainFilename:
        'static/webpack/[fullhash].[runtime].hot-update.json',
      // This saves chunks with the name given via `import()`
      chunkFilename: isServer
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
        'next-serverless-loader',
        'next-style-loader',
        'next-flight-client-loader',
        'next-flight-server-loader',
        'noop-loader',
        'next-middleware-loader',
        'next-middleware-ssr-loader',
        'next-middleware-wasm-loader',
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
        ...(hasServerComponents
          ? isServer
            ? [
                // RSC server compilation loaders
                {
                  ...rscCodeCondition,
                  use: {
                    loader: 'next-flight-server-loader',
                  },
                },
              ]
            : [
                // RSC client compilation loaders
                {
                  ...rscCodeCondition,
                  use: {
                    loader: 'next-flight-server-loader',
                    options: {
                      client: 1,
                    },
                  },
                },
              ]
          : []),
        {
          test: /\.(js|cjs|mjs)$/,
          issuerLayer: 'api',
          parser: {
            // Switch back to normal URL handling
            url: true,
          },
        },
        {
          oneOf: [
            {
              ...codeCondition,
              issuerLayer: 'api',
              parser: {
                // Switch back to normal URL handling
                url: true,
              },
              use: defaultLoaders.babel,
            },
            {
              ...codeCondition,
              issuerLayer: 'middleware',
              use: getBabelOrSwcLoader(true),
            },
            {
              ...codeCondition,
              use: hasReactRefresh
                ? [
                    require.resolve(
                      'next/dist/compiled/@next/react-refresh-utils/loader'
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
                options: {
                  isServer,
                  isDev: dev,
                  basePath: config.basePath,
                  assetPrefix: config.assetPrefix,
                },
              },
            ]
          : []),
      ].filter(Boolean),
    },
    plugins: [
      ...(!dev &&
      !isServer &&
      !!config.experimental.middlewareSourceMaps &&
      !config.productionBrowserSourceMaps
        ? getMiddlewareSourceMapPlugins()
        : []),
      hasReactRefresh && new ReactRefreshWebpackPlugin(webpack),
      // Makes sure `Buffer` and `process` are polyfilled in client and flight bundles (same behavior as webpack 4)
      targetWeb &&
        new webpack.ProvidePlugin({
          // Buffer is used by getInlineScriptSource
          Buffer: [require.resolve('buffer'), 'Buffer'],
          // Avoid process being overridden when in web run time
          ...(!isServer && { process: [require.resolve('process')] }),
        }),
      new webpack.DefinePlugin({
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
          if (/^(?:NODE_.+)|^(?:__.+)$/i.test(key)) {
            throw new Error(
              `The key "${key}" under "env" in ${config.configFileName} is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
            )
          }

          return {
            ...acc,
            [`process.env.${key}`]: JSON.stringify(config.env[key]),
          }
        }, {}),
        // TODO: enforce `NODE_ENV` on `process.env`, and add a test:
        'process.env.NODE_ENV': JSON.stringify(
          dev ? 'development' : 'production'
        ),
        'process.env.__NEXT_CROSS_ORIGIN': JSON.stringify(crossOrigin),
        'process.browser': JSON.stringify(targetWeb),
        'process.env.__NEXT_TEST_MODE': JSON.stringify(
          process.env.__NEXT_TEST_MODE
        ),
        // This is used in client/dev-error-overlay/hot-dev-client.js to replace the dist directory
        ...(dev && !isServer
          ? {
              'process.env.__NEXT_DIST_DIR': JSON.stringify(distDir),
            }
          : {}),
        'process.env.__NEXT_TRAILING_SLASH': JSON.stringify(
          config.trailingSlash
        ),
        'process.env.__NEXT_BUILD_INDICATOR': JSON.stringify(
          config.devIndicators.buildActivity
        ),
        'process.env.__NEXT_BUILD_INDICATOR_POSITION': JSON.stringify(
          config.devIndicators.buildActivityPosition
        ),
        'process.env.__NEXT_PLUGINS': JSON.stringify(
          config.experimental.plugins
        ),
        'process.env.__NEXT_STRICT_MODE': JSON.stringify(
          config.reactStrictMode
        ),
        'process.env.__NEXT_REACT_ROOT': JSON.stringify(hasReactRoot),
        'process.env.__NEXT_CONCURRENT_FEATURES': JSON.stringify(
          hasConcurrentFeatures
        ),
        'process.env.__NEXT_RSC': JSON.stringify(hasServerComponents),
        'process.env.__NEXT_OPTIMIZE_FONTS': JSON.stringify(
          config.optimizeFonts && !dev
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
          experimentalLayoutRaw: config.experimental?.images?.layoutRaw,
          ...(dev
            ? {
                // pass domains in development to allow validating on the client
                domains: config.images.domains,
              }
            : {}),
        }),
        'process.env.__NEXT_ROUTER_BASEPATH': JSON.stringify(config.basePath),
        'process.env.__NEXT_HAS_REWRITES': JSON.stringify(hasRewrites),
        'process.env.__NEXT_I18N_SUPPORT': JSON.stringify(!!config.i18n),
        'process.env.__NEXT_I18N_DOMAINS': JSON.stringify(config.i18n?.domains),
        'process.env.__NEXT_ANALYTICS_ID': JSON.stringify(config.analyticsId),
        ...(isServer
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
            new Proxy(${!targetWeb ? 'process.env' : '{}'}, {
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
      }),
      !isServer &&
        new ReactLoadablePlugin({
          filename: REACT_LOADABLE_MANIFEST,
          pagesDir,
          runtimeAsset: hasConcurrentFeatures
            ? `server/${MIDDLEWARE_REACT_LOADABLE_MANIFEST}.js`
            : undefined,
          dev,
        }),
      targetWeb && new DropClientPage(),
      config.outputFileTracing &&
        !isLikeServerless &&
        isServer &&
        !dev &&
        new TraceEntryPointsPlugin({
          appDir: dir,
          esmExternals: config.experimental.esmExternals,
          staticImageImports: !config.images.disableStaticImages,
          outputFileTracingRoot: config.experimental.outputFileTracingRoot,
        }),
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
            const devPlugins = [new NextJsRequireCacheHotReloader()]

            if (targetWeb) {
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
      ((isServerless && isServer) || isEdgeRuntime) && new ServerlessPlugin(),
      isServer &&
        new PagesManifestPlugin({
          serverless: isLikeServerless,
          dev,
          isEdgeRuntime,
        }),
      // MiddlewarePlugin should be after DefinePlugin so  NEXT_PUBLIC_*
      // replacement is done before its process.env.* handling
      (!isServer || isEdgeRuntime) &&
        new MiddlewarePlugin({ dev, isEdgeRuntime }),
      !isServer &&
        new BuildManifestPlugin({
          buildId,
          rewrites,
          isDevFallback,
          exportRuntime: hasConcurrentFeatures,
        }),
      new ProfilingPlugin({ runWebpackSpan }),
      config.optimizeFonts &&
        !dev &&
        isServer &&
        !isEdgeRuntime &&
        (function () {
          const { FontStylesheetGatheringPlugin } =
            require('./webpack/plugins/font-stylesheet-gathering-plugin') as {
              FontStylesheetGatheringPlugin: typeof import('./webpack/plugins/font-stylesheet-gathering-plugin').FontStylesheetGatheringPlugin
            }
          return new FontStylesheetGatheringPlugin({
            isLikeServerless,
          })
        })(),
      new WellKnownErrorsPlugin(),
      !isServer &&
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
      hasServerComponents &&
        !isServer &&
        new FlightManifestPlugin({ dev, pageExtensions: rawPageExtensions }),
      !dev &&
        !isServer &&
        new TelemetryPlugin(
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
              ['swcEmotion', !!config.experimental.emotion],
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

  if (jsConfig?.compilerOptions?.paths && resolvedBaseUrl) {
    webpackConfig.resolve?.plugins?.unshift(
      new JsConfigPathsPlugin(jsConfig.compilerOptions.paths, resolvedBaseUrl)
    )
  }

  const webpack5Config = webpackConfig as webpack5.Configuration

  webpack5Config.module?.rules?.unshift({
    test: /\.wasm$/,
    issuerLayer: 'middleware',
    loader: 'next-middleware-wasm-loader',
    type: 'javascript/auto',
    resourceQuery: /module/i,
  })

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

  if (targetWeb) {
    webpack5Config.output!.enabledLibraryTypes = ['assign']
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
    crossOrigin: config.crossOrigin,
    pageExtensions: config.pageExtensions,
    trailingSlash: config.trailingSlash,
    buildActivity: config.devIndicators.buildActivity,
    buildActivityPosition: config.devIndicators.buildActivityPosition,
    productionBrowserSourceMaps: !!config.productionBrowserSourceMaps,
    plugins: config.experimental.plugins,
    reactStrictMode: config.reactStrictMode,
    reactMode: config.experimental.reactMode,
    optimizeFonts: config.optimizeFonts,
    optimizeCss: config.experimental.optimizeCss,
    nextScriptWorkers: config.experimental.nextScriptWorkers,
    scrollRestoration: config.experimental.scrollRestoration,
    basePath: config.basePath,
    pageEnv: config.experimental.pageEnv,
    excludeDefaultMomentLocales: config.excludeDefaultMomentLocales,
    assetPrefix: config.assetPrefix,
    disableOptimizedLoading,
    target,
    isEdgeRuntime,
    reactProductionProfiling,
    webpack: !!config.webpack,
    hasRewrites,
    reactRoot: config.experimental.reactRoot,
    runtime,
    swcMinify: config.swcMinify,
    swcLoader: useSWCLoader,
    removeConsole: config.compiler?.removeConsole,
    reactRemoveProperties: config.compiler?.reactRemoveProperties,
    styledComponents: config.compiler?.styledComponents,
    relay: config.compiler?.relay,
    emotion: config.experimental?.emotion,
    modularizeImports: config.experimental?.modularizeImports,
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

    const profile = (profileClient && !isServer) || (profileServer && isServer)
    const summary = (summaryClient && !isServer) || (summaryServer && isServer)

    const logDefault = !infra && !profile && !summary

    if (logDefault || infra) {
      webpack5Config.infrastructureLogging = {
        level: 'verbose',
        debug: /FileSystemInfo/,
      }
    }

    if (logDefault || profile) {
      webpack5Config.plugins!.push((compiler: webpack5.Compiler) => {
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
      webpack5Config.plugins!.push((compiler: webpack5.Compiler) => {
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
        webpack.ProgressPlugin as unknown as typeof webpack5.ProgressPlugin
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
    customAppFile: new RegExp(escapeStringRegexp(path.join(pagesDir, `_app`))),
    isDevelopment: dev,
    isServer,
    isEdgeRuntime,
    targetWeb,
    assetPrefix: config.assetPrefix || '',
    sassOptions: config.sassOptions,
    productionBrowserSourceMaps: config.productionBrowserSourceMaps,
    future: config.future,
    experimental: config.experimental,
    disableStaticImages: config.images.disableStaticImages,
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
      isServer,
      buildId,
      config,
      defaultLoaders,
      totalPages,
      webpack,
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

    // eslint-disable-next-line no-shadow
    const webpack5Config = webpackConfig as webpack5.Configuration

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
        rule.loader !== 'next-image-loader' &&
        'test' in rule &&
        rule.test instanceof RegExp &&
        rule.test.test('.svg')
    )
    const nextImageRule = rules.find(
      (rule) => rule.loader === 'next-image-loader'
    )
    if (hasCustomSvg && nextImageRule) {
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
    webpackConfig.module?.rules.some(
      (rule) => canMatchCss(rule.test) || canMatchCss(rule.include)
    ) ?? false

  if (hasUserCssConfig) {
    // only show warning for one build
    if (isServer) {
      console.warn(
        chalk.yellow.bold('Warning: ') +
          chalk.bold(
            'Built-in CSS support is being disabled due to custom CSS configuration being detected.\n'
          ) +
          'See here for more info: https://nextjs.org/docs/messages/built-in-css-disabled\n'
      )
    }

    if (webpackConfig.module?.rules.length) {
      // Remove default CSS Loaders
      webpackConfig.module.rules.forEach((r) => {
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
  if (hasReactRefresh) {
    attachReactRefresh(webpackConfig, defaultLoaders.babel)
  }

  // check if using @zeit/next-typescript and show warning
  if (
    isServer &&
    webpackConfig.module &&
    Array.isArray(webpackConfig.module.rules)
  ) {
    let foundTsRule = false

    webpackConfig.module.rules = webpackConfig.module.rules.filter(
      (rule): boolean => {
        if (!(rule.test instanceof RegExp)) return true
        if ('noop.ts'.match(rule.test) && !'noop.js'.match(rule.test)) {
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
      const entry: webpack5.EntryObject =
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

      if (!isEdgeRuntime) {
        for (const name of Object.keys(entry)) {
          entry[name] = finalizeEntrypoint({
            value: entry[name],
            isServer,
            isMiddleware: MIDDLEWARE_ROUTE.test(name),
            name,
          })
        }
      }

      return entry
    }
    // @ts-ignore webpack 5 typings needed
    webpackConfig.entry = updatedEntry
  }

  if (!dev) {
    // entry is always a function
    webpackConfig.entry = await (webpackConfig.entry as webpack.EntryFunc)()
  }

  return webpackConfig
}
