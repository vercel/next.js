import ReactRefreshWebpackPlugin from '@next/react-refresh-utils/ReactRefreshWebpackPlugin'
import chalk from 'chalk'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import semver from 'next/dist/compiled/semver'
import { isWebpack5, webpack } from 'next/dist/compiled/webpack/webpack'
import path, { join as pathJoin, relative as relativePath } from 'path'
import {
  DOT_NEXT_ALIAS,
  NEXT_PROJECT_ROOT,
  NEXT_PROJECT_ROOT_DIST_CLIENT,
  PAGES_DIR_ALIAS,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { getPackageVersion } from '../lib/get-package-version'
import { CustomRoutes } from '../lib/load-custom-routes.js'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  REACT_LOADABLE_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import { NextConfigComplete } from '../server/config-shared'
import { findPageFile } from '../server/lib/find-page-file'
import { WebpackEntrypoints } from './entries'
import * as Log from './output/log'
import { build as buildConfiguration } from './webpack/config'
import { __overrideCssConfiguration } from './webpack/config/blocks/css/overrideCssConfiguration'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import BuildStatsPlugin from './webpack/plugins/build-stats-plugin'
import ChunkNamesPlugin from './webpack/plugins/chunk-names-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import NextJsSSRModuleCachePlugin from './webpack/plugins/nextjs-ssr-module-cache'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import WebpackConformancePlugin, {
  DuplicatePolyfillsConformanceCheck,
  GranularChunksConformanceCheck,
  MinificationConformanceCheck,
  ReactSyncScriptsConformanceCheck,
} from './webpack/plugins/webpack-conformance-plugin'
import { WellKnownErrorsPlugin } from './webpack/plugins/wellknown-errors-plugin'
import { regexLikeCss } from './webpack/config/blocks/css'

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

function parseJsonFile(filePath: string) {
  const JSON5 = require('next/dist/compiled/json5')
  const contents = readFileSync(filePath, 'utf8')

  // Special case an empty file
  if (contents.trim() === '') {
    return {}
  }

  try {
    return JSON5.parse(contents)
  } catch (err) {
    const codeFrame = codeFrameColumns(
      String(contents),
      { start: { line: err.lineNumber, column: err.columnNumber } },
      { message: err.message, highlightCode: true }
    )
    throw new Error(`Failed to parse "${filePath}":\n${codeFrame}`)
  }
}

function getOptimizedAliases(isServer: boolean): { [pkg: string]: string } {
  if (isServer) {
    return {}
  }

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
      url: require.resolve('native-url'),
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
  const reactRefreshLoaderName = '@next/react-refresh-utils/loader'
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

const WEBPACK_RESOLVE_OPTIONS = {
  // This always uses commonjs resolving, assuming API is identical
  // between ESM and CJS in a package
  // Otherwise combined ESM+CJS packages will never be external
  // as resolving mismatch would lead to opt-out from being external.
  dependencyType: 'commonjs',
  symlinks: true,
}

const WEBPACK_ESM_RESOLVE_OPTIONS = {
  dependencyType: 'esm',
  symlinks: true,
}

const NODE_RESOLVE_OPTIONS = {
  dependencyType: 'commonjs',
  modules: ['node_modules'],
  alias: false,
  fallback: false,
  exportsFields: ['exports'],
  importsFields: ['imports'],
  conditionNames: ['node', 'require', 'module'],
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

const NODE_ESM_RESOLVE_OPTIONS = {
  ...NODE_RESOLVE_OPTIONS,
  dependencyType: 'esm',
  conditionNames: ['node', 'import', 'module'],
  fullySpecified: true,
}

export default async function getBaseWebpackConfig(
  dir: string,
  {
    buildId,
    config,
    dev = false,
    isServer = false,
    pagesDir,
    target = 'server',
    reactProductionProfiling = false,
    entrypoints,
    rewrites,
    isDevFallback = false,
  }: {
    buildId: string
    config: NextConfigComplete
    dev?: boolean
    isServer?: boolean
    pagesDir: string
    target?: string
    reactProductionProfiling?: boolean
    entrypoints: WebpackEntrypoints
    rewrites: CustomRoutes['rewrites']
    isDevFallback?: boolean
  }
): Promise<webpack.Configuration> {
  const hasRewrites =
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0
  const hasReactRefresh: boolean = dev && !isServer
  const reactDomVersion = await getPackageVersion({
    cwd: dir,
    name: 'react-dom',
  })
  const hasReact18: boolean =
    Boolean(reactDomVersion) &&
    (semver.gte(reactDomVersion!, '18.0.0') ||
      semver.coerce(reactDomVersion)?.version === '18.0.0')
  const hasReactPrerelease =
    Boolean(reactDomVersion) && semver.prerelease(reactDomVersion!) != null
  const hasReactRoot: boolean = config.experimental.reactRoot || hasReact18

  // Only inform during one of the builds
  if (!isServer) {
    if (hasReactRoot) {
      Log.info('Using the createRoot API for React')
    }
    if (hasReactPrerelease) {
      Log.warn(
        `You are using an unsupported prerelease of 'react-dom' which may cause ` +
          `unexpected or broken application behavior. Continue at your own risk.`
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

  // Webpack 5 can use the faster babel loader, webpack 5 has built-in caching for loaders
  // For webpack 4 the old loader is used as it has external caching
  const babelLoader = isWebpack5
    ? require.resolve('./babel/loader/index')
    : 'next-babel-loader'
  const defaultLoaders = {
    babel: {
      loader: babelLoader,
      options: {
        configFile: babelConfigFile,
        isServer,
        distDir,
        pagesDir,
        cwd: dir,
        // Webpack 5 has a built-in loader cache
        cache: !isWebpack5,
        development: dev,
        hasReactRefresh,
        hasJsxRuntime: true,
      },
    },
    // Backwards compat
    hotSelfAccept: {
      loader: 'noop-loader',
    },
  }

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
                `@next/react-refresh-utils/runtime`
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
        [CLIENT_STATIC_FILES_RUNTIME_POLYFILLS]: path.join(
          NEXT_PROJECT_ROOT_DIST_CLIENT,
          'polyfills.js'
        ),
      } as ClientEntries)
    : undefined

  let typeScriptPath: string | undefined
  try {
    typeScriptPath = require.resolve('typescript', { paths: [dir] })
  } catch (_) {}
  const tsConfigPath = path.join(dir, 'tsconfig.json')
  const useTypeScript = Boolean(
    typeScriptPath && (await fileExists(tsConfigPath))
  )

  let jsConfig
  // jsconfig is a subset of tsconfig
  if (useTypeScript) {
    const ts = (await import(typeScriptPath!)) as typeof import('typescript')
    const tsConfig = await getTypeScriptConfiguration(ts, tsConfigPath, true)
    jsConfig = { compilerOptions: tsConfig.options }
  }

  const jsConfigPath = path.join(dir, 'jsconfig.json')
  if (!useTypeScript && (await fileExists(jsConfigPath))) {
    jsConfig = parseJsonFile(jsConfigPath)
  }

  let resolvedBaseUrl
  if (jsConfig?.compilerOptions?.baseUrl) {
    resolvedBaseUrl = path.resolve(dir, jsConfig.compilerOptions.baseUrl)
  }

  function getReactProfilingInProduction() {
    if (reactProductionProfiling) {
      return {
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
      }
    }
  }

  const clientResolveRewrites = require.resolve(
    '../shared/lib/router/utils/resolve-rewrites'
  )
  const clientResolveRewritesNoop = require.resolve(
    '../shared/lib/router/utils/resolve-rewrites-noop'
  )

  const resolveConfig = {
    // Disable .mjs for node_modules bundling
    extensions: isServer
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
      [PAGES_DIR_ALIAS]: pagesDir,
      [DOT_NEXT_ALIAS]: distDir,
      ...getOptimizedAliases(isServer),
      ...getReactProfilingInProduction(),
      [clientResolveRewrites]: hasRewrites
        ? clientResolveRewrites
        : // With webpack 5 an alias can be pointed to false to noop
        isWebpack5
        ? false
        : clientResolveRewritesNoop,
    },
    ...(isWebpack5 && !isServer
      ? {
          // Full list of old polyfills is accessible here:
          // https://github.com/webpack/webpack/blob/2a0536cf510768111a3a6dceeb14cb79b9f59273/lib/ModuleNotFoundError.js#L13-L42
          fallback: {
            assert: require.resolve('assert/'),
            buffer: require.resolve('buffer/'),
            constants: require.resolve('constants-browserify'),
            crypto: require.resolve('crypto-browserify'),
            domain: require.resolve('domain-browser'),
            http: require.resolve('stream-http'),
            https: require.resolve('https-browserify'),
            os: require.resolve('os-browserify/browser'),
            path: require.resolve('path-browserify'),
            punycode: require.resolve('punycode'),
            process: require.resolve('process/browser'),
            // Handled in separate alias
            querystring: require.resolve('querystring-es3'),
            stream: require.resolve('stream-browserify'),
            string_decoder: require.resolve('string_decoder'),
            sys: require.resolve('util/'),
            timers: require.resolve('timers-browserify'),
            tty: require.resolve('tty-browserify'),
            // Handled in separate alias
            // url: require.resolve('url/'),
            util: require.resolve('util/'),
            vm: require.resolve('vm-browserify'),
            zlib: require.resolve('browserify-zlib'),
          },
        }
      : undefined),
    mainFields: isServer ? ['main', 'module'] : ['browser', 'module', 'main'],
    plugins: isWebpack5
      ? // webpack 5+ has the PnP resolver built-in by default:
        []
      : [require('pnp-webpack-plugin')],
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

  // Contains various versions of the Webpack SplitChunksPlugin used in different build types
  const splitChunksConfigs: {
    [propName: string]: webpack.Options.SplitChunksOptions | false
  } = {
    dev: {
      cacheGroups: {
        default: false,
        vendors: false,
      },
    },
    prodGranular: {
      // Keep main and _app chunks unsplitted in webpack 5
      // as we don't need a separate vendor chunk from that
      // and all other chunk depend on them so there is no
      // duplication that need to be pulled out.
      chunks: isWebpack5
        ? (chunk) => !/^(polyfills|main|pages\/_app)$/.test(chunk.name)
        : 'all',
      cacheGroups: {
        framework: {
          chunks: 'all',
          name: 'framework',
          // This regex ignores nested copies of framework libraries so they're
          // bundled with their issuer.
          // https://github.com/vercel/next.js/pull/9012
          test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
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
        commons: {
          name: 'commons',
          minChunks: totalPages,
          priority: 20,
        },
        ...(isWebpack5
          ? undefined
          : {
              default: false,
              vendors: false,
              shared: {
                name(module, chunks) {
                  return (
                    crypto
                      .createHash('sha1')
                      .update(
                        chunks.reduce(
                          (acc: string, chunk: webpack.compilation.Chunk) => {
                            return acc + chunk.name
                          },
                          ''
                        )
                      )
                      .digest('hex') + (isModuleCSS(module) ? '_CSS' : '')
                  )
                },
                priority: 10,
                minChunks: 2,
                reuseExistingChunk: true,
              },
            }),
      },
      maxInitialRequests: 25,
      minSize: 20000,
    },
  }

  // Select appropriate SplitChunksPlugin config for this build
  let splitChunksConfig: webpack.Options.SplitChunksOptions | false
  if (dev) {
    splitChunksConfig = isWebpack5 ? false : splitChunksConfigs.dev
  } else {
    splitChunksConfig = splitChunksConfigs.prodGranular
  }

  const crossOrigin = config.crossOrigin

  let customAppFile: string | null = await findPageFile(
    pagesDir,
    '/_app',
    config.pageExtensions
  )
  if (customAppFile) {
    customAppFile = path.resolve(path.join(pagesDir, customAppFile))
  }

  const conformanceConfig = Object.assign(
    {
      ReactSyncScriptsConformanceCheck: {
        enabled: true,
      },
      MinificationConformanceCheck: {
        enabled: true,
      },
      DuplicatePolyfillsConformanceCheck: {
        enabled: true,
        BlockedAPIToBePolyfilled: Object.assign(
          [],
          ['fetch'],
          config.conformance?.DuplicatePolyfillsConformanceCheck
            ?.BlockedAPIToBePolyfilled || []
        ),
      },
      GranularChunksConformanceCheck: {
        enabled: true,
      },
    },
    config.conformance
  )

  const esmExternals = !!config.experimental?.esmExternals
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

    // Relative requires don't need custom resolution, because they
    // are relative to requests we've already resolved here.
    // Absolute requires (require('/foo')) are extremely uncommon, but
    // also have no need for customization as they're already resolved.
    if (!isLocal) {
      if (/^(?:next$|react(?:$|\/))/.test(request)) {
        return `commonjs ${request}`
      }

      const notExternalModules = /^(?:private-next-pages\/|next\/(?:dist\/pages\/|(?:app|document|link|image|constants)$)|string-hash$)/
      if (notExternalModules.test(request)) {
        return
      }
    }

    // When in esm externals mode, and using import, we resolve with
    // ESM resolving options.
    const isEsmRequested = dependencyType === 'esm'
    const preferEsm = esmExternals && isEsmRequested

    const resolve = getResolve(
      preferEsm ? WEBPACK_ESM_RESOLVE_OPTIONS : WEBPACK_RESOLVE_OPTIONS
    )

    // Resolve the import with the webpack provided context, this
    // ensures we're resolving the correct version when multiple
    // exist.
    let res: string | null
    let isEsm: boolean = false
    try {
      ;[res, isEsm] = await resolve(context, request)
    } catch (err) {
      res = null
    }

    // If resolving fails, and we can use an alternative way
    // try the alternative resolving options.
    if (!res && (isEsmRequested || looseEsmExternals)) {
      const resolveAlternative = getResolve(
        preferEsm ? WEBPACK_RESOLVE_OPTIONS : WEBPACK_ESM_RESOLVE_OPTIONS
      )
      try {
        ;[res, isEsm] = await resolveAlternative(context, request)
      } catch (err) {
        res = null
      }
    }

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

    if (isLocal) {
      // Makes sure dist/shared and dist/server are not bundled
      // we need to process shared/lib/router/router so that
      // the DefinePlugin can inject process.env values
      const isNextExternal = /next[/\\]dist[/\\](shared|server)[/\\](?!lib[/\\]router[/\\]router)/.test(
        res
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
              res
            )
            // Windows path normalization
            .replace(/\\/g, '/')
        )
        return `commonjs ${externalRequest}`
      } else {
        return
      }
    }

    // Bundled Node.js code is relocated without its node_modules tree.
    // This means we need to make sure its request resolves to the same
    // package that'll be available at runtime. If it's not identical,
    // we need to bundle the code (even if it _should_ be external).
    let baseRes: string | null
    let baseIsEsm: boolean
    try {
      const baseResolve = getResolve(
        isEsm ? NODE_ESM_RESOLVE_OPTIONS : NODE_RESOLVE_OPTIONS
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
      return
    }

    const externalType = isEsm ? 'module' : 'commonjs'

    if (
      res.match(/next[/\\]dist[/\\]shared[/\\](?!lib[/\\]router[/\\]router)/)
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
    if (/node_modules[/\\].*\.c?js$/.test(res)) {
      return `${externalType} ${request}`
    }

    // Default behavior: bundle the code!
  }

  const emacsLockfilePattern = '**/.#*'

  let webpackConfig: webpack.Configuration = {
    externals: !isServer
      ? // make sure importing "next" is handled gracefully for client
        // bundles in case a user imported types and it wasn't removed
        // TODO: should we warn/error for this instead?
        ['next']
      : !isServerless
      ? [
          isWebpack5
            ? ({
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
                            ? resolveData?.descriptionFileData?.type ===
                              'module'
                            : /\.mjs$/i.test(result)
                          resolve([result, isEsm])
                        }
                      )
                    })
                })
            : (
                context: string,
                request: string,
                callback: (err?: Error, result?: string | undefined) => void
              ) =>
                handleExternals(
                  context,
                  request,
                  'commonjs',
                  () => (resolveContext: string, requestToResolve: string) =>
                    new Promise((resolve) =>
                      resolve([
                        require.resolve(requestToResolve, {
                          paths: [resolveContext],
                        }),
                        false,
                      ])
                    )
                ).then((result) => callback(undefined, result), callback),
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
      // Webpack 5 uses a new property for the same functionality
      ...(isWebpack5 ? { emitOnErrors: !dev } : { noEmitOnErrors: dev }),
      checkWasmTypes: false,
      nodeEnv: false,
      splitChunks: isServer
        ? isWebpack5 && !dev
          ? ({
              filename: '[name].js',
              // allow to split entrypoints
              chunks: 'all',
              // size of files is not so relevant for server build
              // we want to prefer deduplication to load less code
              minSize: 1000,
            } as any)
          : false
        : splitChunksConfig,
      runtimeChunk: isServer
        ? isWebpack5 && !isLikeServerless
          ? { name: 'webpack-runtime' }
          : undefined
        : { name: CLIENT_STATIC_FILES_RUNTIME_WEBPACK },
      minimize: !(dev || isServer),
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
    node: {
      setImmediate: false,
    },
    // Kept as function to be backwards compatible
    // @ts-ignore TODO webpack 5 typings needed
    entry: async () => {
      return {
        ...(clientEntries ? clientEntries : {}),
        ...entrypoints,
      }
    },
    watchOptions: {
      aggregateTimeout: 5,
      ignored: [
        '**/.git/**',
        '**/node_modules/**',
        '**/.next/**',
        // can be removed after https://github.com/paulmillr/chokidar/issues/955 is released
        emacsLockfilePattern,
      ],
    },
    output: {
      // we must set publicPath to an empty value to override the default of
      // auto which doesn't work in IE11
      publicPath: `${config.assetPrefix || ''}/_next/`,
      path:
        isServer && isWebpack5 && !dev
          ? path.join(outputPath, 'chunks')
          : outputPath,
      // On the server we don't use hashes
      filename: isServer
        ? isWebpack5 && !dev
          ? '../[name].js'
          : '[name].js'
        : `static/chunks/${isDevFallback ? 'fallback/' : ''}[name]${
            dev ? '' : isWebpack5 ? '-[contenthash]' : '-[chunkhash]'
          }.js`,
      library: isServer ? undefined : '_N_E',
      libraryTarget: isServer ? 'commonjs2' : 'assign',
      hotUpdateChunkFilename: isWebpack5
        ? 'static/webpack/[id].[fullhash].hot-update.js'
        : 'static/webpack/[id].[hash].hot-update.js',
      hotUpdateMainFilename: isWebpack5
        ? 'static/webpack/[fullhash].[runtime].hot-update.json'
        : 'static/webpack/[hash].hot-update.json',
      // This saves chunks with the name given via `import()`
      chunkFilename: isServer
        ? '[name].js'
        : `static/chunks/${isDevFallback ? 'fallback/' : ''}${
            dev ? '[name]' : '[name].[contenthash]'
          }.js`,
      strictModuleExceptionHandling: true,
      crossOriginLoading: crossOrigin,
      futureEmitAssets: !dev,
      webassemblyModuleFilename: 'static/wasm/[modulehash].wasm',
    },
    performance: false,
    resolve: resolveConfig,
    resolveLoader: {
      // The loaders Next.js provides
      alias: [
        'emit-file-loader',
        'error-loader',
        'next-babel-loader',
        'next-client-pages-loader',
        'next-image-loader',
        'next-serverless-loader',
        'noop-loader',
        'next-style-loader',
      ].reduce((alias, loader) => {
        // using multiple aliases to replace `resolveLoader.modules`
        alias[loader] = path.join(__dirname, 'webpack', 'loaders', loader)

        return alias
      }, {} as Record<string, string>),
      modules: [
        'node_modules',
        ...nodePathList, // Support for NODE_PATH environment variable
      ],
      plugins: isWebpack5 ? [] : [require('pnp-webpack-plugin')],
    },
    module: {
      rules: [
        ...(isWebpack5
          ? [
              // TODO: FIXME: do NOT webpack 5 support with this
              // x-ref: https://github.com/webpack/webpack/issues/11467
              {
                test: /\.m?js/,
                resolve: {
                  fullySpecified: false,
                },
              } as any,
            ]
          : []),
        {
          test: /\.(tsx|ts|js|mjs|jsx)$/,
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
          use: hasReactRefresh
            ? [
                require.resolve('@next/react-refresh-utils/loader'),
                defaultLoaders.babel,
              ]
            : defaultLoaders.babel,
        },
        ...(!config.images.disableStaticImages && isWebpack5
          ? [
              {
                test: /\.(png|jpg|jpeg|gif|webp|ico|bmp|svg)$/i,
                loader: 'next-image-loader',
                issuer: { not: regexLikeCss },
                dependency: { not: ['url'] },
                options: {
                  isServer,
                  isDev: dev,
                  assetPrefix: config.assetPrefix,
                },
              },
            ]
          : []),
      ].filter(Boolean),
    },
    plugins: [
      hasReactRefresh && new ReactRefreshWebpackPlugin(webpack),
      // Makes sure `Buffer` and `process` are polyfilled in client-side bundles (same behavior as webpack 4)
      isWebpack5 &&
        !isServer &&
        new webpack.ProvidePlugin({
          Buffer: [require.resolve('buffer'), 'Buffer'],
          process: [require.resolve('process')],
        }),
      // This plugin makes sure `output.filename` is used for entry chunks
      !isWebpack5 && new ChunkNamesPlugin(),
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
              `The key "${key}" under "env" in next.config.js is not allowed. https://nextjs.org/docs/messages/env-key-not-allowed`
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
        'process.browser': JSON.stringify(!isServer),
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
        'process.env.__NEXT_PLUGINS': JSON.stringify(
          config.experimental.plugins
        ),
        'process.env.__NEXT_STRICT_MODE': JSON.stringify(
          config.reactStrictMode
        ),
        'process.env.__NEXT_REACT_ROOT': JSON.stringify(hasReactRoot),
        'process.env.__NEXT_OPTIMIZE_FONTS': JSON.stringify(
          config.optimizeFonts && !dev
        ),
        'process.env.__NEXT_OPTIMIZE_IMAGES': JSON.stringify(
          config.experimental.optimizeImages
        ),
        'process.env.__NEXT_OPTIMIZE_CSS': JSON.stringify(
          config.experimental.optimizeCss && !dev
        ),
        'process.env.__NEXT_SCROLL_RESTORATION': JSON.stringify(
          config.experimental.scrollRestoration
        ),
        'process.env.__NEXT_IMAGE_OPTS': JSON.stringify({
          deviceSizes: config.images.deviceSizes,
          imageSizes: config.images.imageSizes,
          path: config.images.path,
          loader: config.images.loader,
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
            new Proxy(${isServer ? 'process.env' : '{}'}, {
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
        }),
      !isServer && new DropClientPage(),
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

            if (!isServer) {
              devPlugins.push(new webpack.HotModuleReplacementPlugin())
            }

            return devPlugins
          })()
        : []),
      // Webpack 5 no longer requires this plugin in production:
      !isWebpack5 && !dev && new webpack.HashedModuleIdsPlugin(),
      !dev &&
        new webpack.IgnorePlugin({
          resourceRegExp: /react-is/,
          contextRegExp: /next[\\/]dist[\\/]/,
        }),
      isServerless && isServer && new ServerlessPlugin(),
      isServer &&
        new PagesManifestPlugin({ serverless: isLikeServerless, dev }),
      !isWebpack5 &&
        target === 'server' &&
        isServer &&
        new NextJsSSRModuleCachePlugin({ outputPath }),
      isServer && new NextJsSsrImportPlugin(),
      !isServer &&
        new BuildManifestPlugin({
          buildId,
          rewrites,
          isDevFallback,
        }),
      !dev &&
        !isServer &&
        config.experimental.stats &&
        new BuildStatsPlugin({
          distDir,
        }),
      new ProfilingPlugin(),
      config.optimizeFonts &&
        !dev &&
        isServer &&
        (function () {
          const {
            FontStylesheetGatheringPlugin,
          } = require('./webpack/plugins/font-stylesheet-gathering-plugin') as {
            FontStylesheetGatheringPlugin: typeof import('./webpack/plugins/font-stylesheet-gathering-plugin').FontStylesheetGatheringPlugin
          }
          return new FontStylesheetGatheringPlugin({
            isLikeServerless,
          })
        })(),
      config.experimental.conformance &&
        !isWebpack5 &&
        !dev &&
        new WebpackConformancePlugin({
          tests: [
            !isServer &&
              conformanceConfig.MinificationConformanceCheck.enabled &&
              new MinificationConformanceCheck(),
            conformanceConfig.ReactSyncScriptsConformanceCheck.enabled &&
              new ReactSyncScriptsConformanceCheck({
                AllowedSources:
                  conformanceConfig.ReactSyncScriptsConformanceCheck
                    .allowedSources || [],
              }),
            !isServer &&
              conformanceConfig.DuplicatePolyfillsConformanceCheck.enabled &&
              new DuplicatePolyfillsConformanceCheck({
                BlockedAPIToBePolyfilled:
                  conformanceConfig.DuplicatePolyfillsConformanceCheck
                    .BlockedAPIToBePolyfilled,
              }),
            !isServer &&
              conformanceConfig.GranularChunksConformanceCheck.enabled &&
              new GranularChunksConformanceCheck(
                splitChunksConfigs.prodGranular
              ),
          ].filter(Boolean),
        }),
      new WellKnownErrorsPlugin(),
    ].filter((Boolean as any) as ExcludesFalse),
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

  if (isWebpack5) {
    // futureEmitAssets is on by default in webpack 5
    delete webpackConfig.output?.futureEmitAssets

    if (isServer && dev) {
      // Enable building of client compilation before server compilation in development
      // @ts-ignore dependencies exists
      webpackConfig.dependencies = ['client']
    }
    // webpack 5 no longer polyfills Node.js modules:
    if (webpackConfig.node) delete webpackConfig.node.setImmediate

    // Due to bundling of webpack the default values can't be correctly detected
    // This restores the webpack defaults
    // @ts-ignore webpack 5
    webpackConfig.snapshot = {}
    if (process.versions.pnp === '3') {
      const match = /^(.+?)[\\/]cache[\\/]jest-worker-npm-[^\\/]+\.zip[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
      if (match) {
        // @ts-ignore webpack 5
        webpackConfig.snapshot.managedPaths = [
          path.resolve(match[1], 'unplugged'),
        ]
      }
    } else {
      const match = /^(.+?[\\/]node_modules)[\\/]/.exec(
        require.resolve('jest-worker')
      )
      if (match) {
        // @ts-ignore webpack 5
        webpackConfig.snapshot.managedPaths = [match[1]]
      }
    }
    if (process.versions.pnp === '1') {
      const match = /^(.+?[\\/]v4)[\\/]npm-jest-worker-[^\\/]+-[\da-f]{40}[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
      if (match) {
        // @ts-ignore webpack 5
        webpackConfig.snapshot.immutablePaths = [match[1]]
      }
    } else if (process.versions.pnp === '3') {
      const match = /^(.+?)[\\/]jest-worker-npm-[^\\/]+\.zip[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
      if (match) {
        // @ts-ignore webpack 5
        webpackConfig.snapshot.immutablePaths = [match[1]]
      }
    }

    if (dev) {
      if (!webpackConfig.optimization) {
        webpackConfig.optimization = {}
      }
      webpackConfig.optimization.providedExports = false
      webpackConfig.optimization.usedExports = false
    }

    const configVars = JSON.stringify({
      crossOrigin: config.crossOrigin,
      pageExtensions: config.pageExtensions,
      trailingSlash: config.trailingSlash,
      buildActivity: config.devIndicators.buildActivity,
      plugins: config.experimental.plugins,
      reactStrictMode: config.reactStrictMode,
      reactMode: config.experimental.reactMode,
      optimizeFonts: config.optimizeFonts,
      optimizeImages: config.experimental.optimizeImages,
      optimizeCss: config.experimental.optimizeCss,
      scrollRestoration: config.experimental.scrollRestoration,
      basePath: config.basePath,
      pageEnv: config.experimental.pageEnv,
      excludeDefaultMomentLocales: config.excludeDefaultMomentLocales,
      assetPrefix: config.assetPrefix,
      disableOptimizedLoading: config.experimental.disableOptimizedLoading,
      target,
      reactProductionProfiling,
      webpack: !!config.webpack,
      hasRewrites,
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

    webpackConfig.cache = cache

    if (process.env.NEXT_WEBPACK_LOGGING) {
      const logInfra = process.env.NEXT_WEBPACK_LOGGING.includes(
        'infrastructure'
      )
      const logProfileClient = process.env.NEXT_WEBPACK_LOGGING.includes(
        'profile-client'
      )
      const logProfileServer = process.env.NEXT_WEBPACK_LOGGING.includes(
        'profile-server'
      )
      const logDefault = !logInfra && !logProfileClient && !logProfileServer

      if (logDefault || logInfra) {
        // @ts-ignore TODO: remove ignore when webpack 5 is stable
        webpackConfig.infrastructureLogging = {
          level: 'verbose',
          debug: /FileSystemInfo/,
        }
      }

      if (
        logDefault ||
        (logProfileClient && !isServer) ||
        (logProfileServer && isServer)
      ) {
        webpackConfig.plugins!.push((compiler: webpack.Compiler) => {
          compiler.hooks.done.tap('next-webpack-logging', (stats) => {
            console.log(
              stats.toString({
                colors: true,
                // @ts-ignore TODO: remove ignore when webpack 5 is stable
                logging: logDefault ? 'log' : 'verbose',
              })
            )
          })
        })
      }

      if ((logProfileClient && !isServer) || (logProfileServer && isServer)) {
        webpackConfig.plugins!.push(
          new webpack.ProgressPlugin({
            // @ts-ignore TODO: remove ignore when webpack 5 is stable
            profile: true,
          })
        )
        webpackConfig.profile = true
      }
    }
  }

  webpackConfig = await buildConfiguration(webpackConfig, {
    rootDirectory: dir,
    customAppFile,
    isDevelopment: dev,
    isServer,
    assetPrefix: config.assetPrefix || '',
    sassOptions: config.sassOptions,
    productionBrowserSourceMaps: config.productionBrowserSourceMaps,
    future: config.future,
    isCraCompat: config.experimental.craCompat,
  })

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
        'Webpack config is undefined. You may have forgot to return properly from within the "webpack" method of your next.config.js.\n' +
          'See more info here https://nextjs.org/docs/messages/undefined-webpack-config'
      )
    }

    if (dev && originalDevtool !== webpackConfig.devtool) {
      webpackConfig.devtool = originalDevtool
      devtoolRevertWarning(originalDevtool)
    }

    if (typeof (webpackConfig as any).then === 'function') {
      console.warn(
        '> Promise returned in next config. https://nextjs.org/docs/messages/promise-in-next-config'
      )
    }
  }

  if (!config.images.disableStaticImages && isWebpack5) {
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
      nextImageRule.test = /\.(png|jpg|jpeg|gif|webp|ico|bmp)$/i
    }
  }

  if (
    config.experimental.craCompat &&
    webpackConfig.module?.rules &&
    webpackConfig.plugins
  ) {
    // CRA prevents loading all locales by default
    // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L721
    webpackConfig.plugins.push(
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
    )

    // CRA allows importing non-webpack handled files with file-loader
    // these need to be the last rule to prevent catching other items
    // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L594
    const fileLoaderExclude = [/\.(js|mjs|jsx|ts|tsx|json)$/]
    const fileLoader = isWebpack5
      ? {
          exclude: fileLoaderExclude,
          issuer: fileLoaderExclude,
          type: 'asset/resource',
          generator: {
            publicPath: '/_next/',
            filename: 'static/media/[name].[hash:8].[ext]',
          },
        }
      : {
          loader: require.resolve('next/dist/compiled/file-loader'),
          // Exclude `js` files to keep "css" loader working as it injects
          // its runtime that would otherwise be processed through "file" loader.
          // Also exclude `html` and `json` extensions so they get processed
          // by webpacks internal loaders.
          exclude: fileLoaderExclude,
          issuer: fileLoaderExclude,
          options: {
            publicPath: '/_next/static/media',
            outputPath: 'static/media',
            name: '[name].[hash:8].[ext]',
          },
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
      '/tmp/test.css',
      '/tmp/test.scss',
      '/tmp/test.sass',
      '/tmp/test.less',
      '/tmp/test.styl',
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
      // Remove default CSS Loader
      webpackConfig.module.rules = webpackConfig.module.rules.filter(
        (r) =>
          !(
            typeof r.oneOf?.[0]?.options === 'object' &&
            r.oneOf[0].options.__next_css_remove === true
          )
      )
    }
    if (webpackConfig.plugins?.length) {
      // Disable CSS Extraction Plugin
      webpackConfig.plugins = webpackConfig.plugins.filter(
        (p) => (p as any).__next_css_remove !== true
      )
    }
    if (webpackConfig.optimization?.minimizer?.length) {
      // Disable CSS Minifier
      webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.filter(
        (e) => (e as any).__next_css_remove !== true
      )
    }
  } else if (!config.future.strictPostcssConfiguration) {
    await __overrideCssConfiguration(dir, !dev, webpackConfig)
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
        '\n@zeit/next-typescript is no longer needed since Next.js has built-in support for TypeScript now. Please remove it from your next.config.js and your .babelrc\n'
      )
    }
  }

  // Patch `@zeit/next-sass`, `@zeit/next-less`, `@zeit/next-stylus` for compatibility
  if (webpackConfig.module && Array.isArray(webpackConfig.module.rules)) {
    ;[].forEach.call(webpackConfig.module.rules, function (
      rule: webpack.RuleSetRule
    ) {
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
    })
  }

  // Backwards compat for `main.js` entry key
  // and setup of dependencies between entries
  // we can't do that in the initial entry for
  // backward-compat reasons
  const originalEntry: any = webpackConfig.entry
  if (typeof originalEntry !== 'undefined') {
    const updatedEntry = async () => {
      const entry: WebpackEntrypoints =
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

      if (isWebpack5 && !isServer) {
        for (const name of Object.keys(entry)) {
          if (
            name === 'polyfills' ||
            name === 'main' ||
            name === 'amp' ||
            name === 'react-refresh'
          )
            continue
          const dependOn =
            name.startsWith('pages/') && name !== 'pages/_app'
              ? 'pages/_app'
              : 'main'
          const old = entry[name]
          if (typeof old === 'object' && !Array.isArray(old)) {
            entry[name] = {
              dependOn,
              ...old,
            }
          } else {
            entry[name] = {
              import: old,
              dependOn,
            }
          }
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
