import ReactRefreshWebpackPlugin from '@next/react-refresh-utils/ReactRefreshWebpackPlugin'
import chalk from 'chalk'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import { codeFrameColumns } from 'next/dist/compiled/babel/code-frame'
import semver from 'next/dist/compiled/semver'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import type webpack5 from 'webpack5'
import path, { join as pathJoin, relative as relativePath } from 'path'
import escapeRegExp from 'next/dist/compiled/escape-string-regexp'
import {
  DOT_NEXT_ALIAS,
  NEXT_PROJECT_ROOT,
  NEXT_PROJECT_ROOT_DIST_CLIENT,
  PAGES_DIR_ALIAS,
  MIDDLEWARE_ROUTE,
} from '../lib/constants'
import { fileExists } from '../lib/file-exists'
import { getPackageVersion } from '../lib/get-package-version'
import { CustomRoutes } from '../lib/load-custom-routes.js'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import {
  CLIENT_STATIC_FILES_RUNTIME_AMP,
  CLIENT_STATIC_FILES_RUNTIME_MAIN,
  CLIENT_STATIC_FILES_RUNTIME_POLYFILLS_SYMBOL,
  CLIENT_STATIC_FILES_RUNTIME_REACT_REFRESH,
  CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
  REACT_LOADABLE_MANIFEST,
  SERVERLESS_DIRECTORY,
  SERVER_DIRECTORY,
} from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import { NextConfigComplete } from '../server/config-shared'
import { finalizeEntrypoint } from './entries'
import * as Log from './output/log'
import { build as buildConfiguration } from './webpack/config'
import { __overrideCssConfiguration } from './webpack/config/blocks/css/overrideCssConfiguration'
import MiddlewarePlugin from './webpack/plugins/middleware-plugin'
import BuildManifestPlugin from './webpack/plugins/build-manifest-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { DropClientPage } from './webpack/plugins/next-drop-client-page-plugin'
import { TraceEntryPointsPlugin } from './webpack/plugins/next-trace-entrypoints-plugin'
import NextJsSsrImportPlugin from './webpack/plugins/nextjs-ssr-import'
import PagesManifestPlugin from './webpack/plugins/pages-manifest-plugin'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { ReactLoadablePlugin } from './webpack/plugins/react-loadable-plugin'
import { ServerlessPlugin } from './webpack/plugins/serverless-plugin'
import { WellKnownErrorsPlugin } from './webpack/plugins/wellknown-errors-plugin'
import { regexLikeCss } from './webpack/config/blocks/css'
import { CopyFilePlugin } from './webpack/plugins/copy-file-plugin'
import { TelemetryPlugin } from './webpack/plugins/telemetry-plugin'
import type { Span } from '../trace'
import isError from '../lib/is-error'

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
    if (!isError(err)) throw err
    const codeFrame = codeFrameColumns(
      String(contents),
      {
        start: {
          line: (err as Error & { lineNumber?: number }).lineNumber || 0,
          column: (err as Error & { columnNumber?: number }).columnNumber || 0,
        },
      },
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

let TSCONFIG_WARNED = false

export const nextImageLoaderRegex =
  /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i

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
    runWebpackSpan,
  }: {
    buildId: string
    config: NextConfigComplete
    dev?: boolean
    isServer?: boolean
    pagesDir: string
    target?: string
    reactProductionProfiling?: boolean
    entrypoints: webpack5.EntryObject
    rewrites: CustomRoutes['rewrites']
    isDevFallback?: boolean
    runWebpackSpan: Span
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

  const useSWCLoader = config.experimental.swcLoader
  if (useSWCLoader && babelConfigFile) {
    Log.warn(
      `experimental.swcLoader enabled. The custom Babel configuration will not be used.`
    )
  }
  const defaultLoaders = {
    babel: useSWCLoader
      ? {
          loader: 'next-swc-loader',
          options: {
            isServer,
            pagesDir,
          },
        }
      : {
          loader: require.resolve('./babel/loader/index'),
          options: {
            configFile: babelConfigFile,
            isServer,
            distDir,
            pagesDir,
            cwd: dir,
            development: dev,
            hasReactRefresh,
            hasJsxRuntime: true,
          },
        },
    babelMiddleware: {
      loader: require.resolve('./babel/loader/index'),
      options: {
        cache: false,
        configFile: babelConfigFile,
        cwd: dir,
        development: dev,
        distDir,
        hasJsxRuntime: true,
        hasReactRefresh: false,
        isServer: true,
        pagesDir,
      },
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
      } as ClientEntries)
    : undefined

  let typeScriptPath: string | undefined
  try {
    typeScriptPath = require.resolve('typescript', { paths: [dir] })
  } catch (_) {}
  const tsConfigPath = path.join(dir, config.typescript.tsconfigPath)
  const useTypeScript = Boolean(
    typeScriptPath && (await fileExists(tsConfigPath))
  )

  let jsConfig
  // jsconfig is a subset of tsconfig
  if (useTypeScript) {
    if (
      config.typescript.tsconfigPath !== 'tsconfig.json' &&
      TSCONFIG_WARNED === false
    ) {
      TSCONFIG_WARNED = true
      Log.info(`Using tsconfig file: ${config.typescript.tsconfigPath}`)
    }

    const ts = (await Promise.resolve(
      require(typeScriptPath!)
    )) as typeof import('typescript')
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
      ...config.pageExtensions.reduce((prev, ext) => {
        prev.push(path.join(pagesDir, `_app.${ext}`))
        return prev
      }, [] as string[]),
      'next/dist/pages/_app.js',
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
      'next/dist/pages/_document.js',
    ]
  }

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

      ...customAppAliases,
      ...customErrorAlias,
      ...customDocumentAliases,

      [PAGES_DIR_ALIAS]: pagesDir,
      [DOT_NEXT_ALIAS]: distDir,
      ...getOptimizedAliases(isServer),
      ...getReactProfilingInProduction(),

      ...(!isServer
        ? {
            [clientResolveRewrites]: hasRewrites
              ? clientResolveRewrites
              : // With webpack 5 an alias can be pointed to false to noop
                false,
          }
        : {}),
    },
    ...(!isServer
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

  // Select appropriate SplitChunksPlugin config for this build
  const splitChunksConfig: webpack.Options.SplitChunksOptions | false = dev
    ? false
    : {
        // Keep main and _app chunks unsplitted in webpack 5
        // as we don't need a separate vendor chunk from that
        // and all other chunk depend on them so there is no
        // duplication that need to be pulled out.
        chunks: (chunk) => !/^(polyfills|main|pages\/_app)$/.test(chunk.name),
        cacheGroups: {
          framework: {
            chunks: (chunk: webpack.compilation.Chunk) =>
              !chunk.name?.match(MIDDLEWARE_ROUTE),
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
          middleware: {
            chunks: (chunk: webpack.compilation.Chunk) =>
              chunk.name?.match(MIDDLEWARE_ROUTE),
            filename: 'server/middleware-chunks/[name].js',
            minChunks: 2,
          },
        },
        maxInitialRequests: 25,
        minSize: 20000,
      }

  const crossOrigin = config.crossOrigin

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

      const notExternalModules =
        /^(?:private-next-pages\/|next\/(?:dist\/pages\/|(?:app|document|link|image|constants|dynamic)$)|string-hash$)/
      if (notExternalModules.test(request)) {
        return
      }
    }

    // When in esm externals mode, and using import, we resolve with
    // ESM resolving options.
    const isEsmRequested = dependencyType === 'esm'
    const preferEsm = esmExternals && isEsmRequested

    const resolve = getResolve(
      preferEsm ? NODE_ESM_RESOLVE_OPTIONS : NODE_RESOLVE_OPTIONS
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
        preferEsm ? NODE_RESOLVE_OPTIONS : NODE_ESM_RESOLVE_OPTIONS
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
      // we need to process shared `router/router` and `dynamic`,
      // so that the DefinePlugin can inject process.env values
      const isNextExternal =
        /next[/\\]dist[/\\](shared|server)[/\\](?!lib[/\\](router[/\\]router|dynamic))/.test(
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
        isEsm ? NODE_BASE_ESM_RESOLVE_OPTIONS : NODE_BASE_RESOLVE_OPTIONS
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

  let webpackConfig: webpack.Configuration = {
    parallelism: Number(process.env.NEXT_WEBPACK_PARALLELISM) || undefined,
    externals: !isServer
      ? // make sure importing "next" is handled gracefully for client
        // bundles in case a user imported types and it wasn't removed
        // TODO: should we warn/error for this instead?
        ['next']
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
      splitChunks: isServer
        ? dev
          ? false
          : ({
              filename: '[name].js',
              // allow to split entrypoints
              chunks: ({ name }: any) => !name?.match(MIDDLEWARE_ROUTE),
              // size of files is not so relevant for server build
              // we want to prefer deduplication to load less code
              minSize: 1000,
            } as any)
        : splitChunksConfig,
      runtimeChunk: isServer
        ? undefined
        : {
            name: ({ name }) =>
              name.match(MIDDLEWARE_ROUTE)
                ? '../../server/middleware-runtime'
                : CLIENT_STATIC_FILES_RUNTIME_WEBPACK,
          },
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
            swcMinify: config.experimental.swcMinify,
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
      path: isServer && !dev ? path.join(outputPath, 'chunks') : outputPath,
      // On the server we don't use hashes
      filename: isServer
        ? !dev
          ? '../[name].js'
          : '[name].js'
        : `static/chunks/${isDevFallback ? 'fallback/' : ''}[name]${
            dev ? '' : '-[contenthash]'
          }.js`,
      library: isServer ? undefined : '_N_E',
      libraryTarget: isServer ? 'commonjs2' : 'assign',
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
        'noop-loader',
        'next-middleware-loader',
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
              use: defaultLoaders.babelMiddleware,
            },
            {
              ...codeCondition,
              use: hasReactRefresh
                ? [
                    require.resolve('@next/react-refresh-utils/loader'),
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
      hasReactRefresh && new ReactRefreshWebpackPlugin(webpack),
      // Makes sure `Buffer` and `process` are polyfilled in client-side bundles (same behavior as webpack 4)
      !isServer &&
        new webpack.ProvidePlugin({
          Buffer: [require.resolve('buffer'), 'Buffer'],
          process: [require.resolve('process')],
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
        'process.env.__NEXT_CONCURRENT_FEATURES': JSON.stringify(
          config.experimental.concurrentFeatures && hasReactRoot
        ),
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
      config.experimental.outputFileTracing &&
        !isLikeServerless &&
        isServer &&
        !dev &&
        new TraceEntryPointsPlugin({
          appDir: dir,
          esmExternals: config.experimental.esmExternals,
          staticImageImports: !config.images.disableStaticImages,
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

            if (!isServer) {
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
      isServerless && isServer && new ServerlessPlugin(),
      isServer &&
        new PagesManifestPlugin({ serverless: isLikeServerless, dev }),
      // MiddlewarePlugin should be after DefinePlugin so  NEXT_PUBLIC_*
      // replacement is done before its process.env.* handling
      !isServer && new MiddlewarePlugin({ dev }),
      isServer && new NextJsSsrImportPlugin(),
      !isServer &&
        new BuildManifestPlugin({
          buildId,
          rewrites,
          isDevFallback,
        }),
      new ProfilingPlugin({ runWebpackSpan }),
      config.optimizeFonts &&
        !dev &&
        isServer &&
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
      !dev && !isServer && new TelemetryPlugin(),
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

  webpack5Config.experiments = {
    layers: true,
    cacheUnaffected: false, // Disabled for now due to a webpack bug
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

  if (!isServer) {
    webpack5Config.output!.enabledLibraryTypes = ['assign']
  }

  if (dev) {
    // @ts-ignore unsafeCache exists
    webpack5Config.module.unsafeCache = (module) =>
      !/[\\/]pages[\\/][^\\/]+(?:$|\?|#)/.test(module.resource)
  }

  // Due to bundling of webpack the default values can't be correctly detected
  // This restores the webpack defaults
  webpack5Config.snapshot = {}
  if (process.versions.pnp === '3') {
    const match =
      /^(.+?)[\\/]cache[\\/]jest-worker-npm-[^\\/]+\.zip[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
    if (match) {
      webpack5Config.snapshot.managedPaths = [
        path.resolve(match[1], 'unplugged'),
      ]
    }
  } else {
    const match = /^(.+?[\\/]node_modules)[\\/]/.exec(
      require.resolve('jest-worker')
    )
    if (match) {
      webpack5Config.snapshot.managedPaths = [match[1]]
    }
  }
  if (process.versions.pnp === '1') {
    const match =
      /^(.+?[\\/]v4)[\\/]npm-jest-worker-[^\\/]+-[\da-f]{40}[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
    if (match) {
      webpack5Config.snapshot.immutablePaths = [match[1]]
    }
  } else if (process.versions.pnp === '3') {
    const match =
      /^(.+?)[\\/]jest-worker-npm-[^\\/]+\.zip[\\/]node_modules[\\/]/.exec(
        require.resolve('jest-worker')
      )
    if (match) {
      webpack5Config.snapshot.immutablePaths = [match[1]]
    }
  }

  if (dev) {
    if (!webpack5Config.optimization) {
      webpack5Config.optimization = {}
    }
    webpack5Config.optimization.providedExports = false
    webpack5Config.optimization.usedExports = false
  }

  const configVars = JSON.stringify({
    crossOrigin: config.crossOrigin,
    pageExtensions: config.pageExtensions,
    trailingSlash: config.trailingSlash,
    buildActivity: config.devIndicators.buildActivity,
    productionBrowserSourceMaps: !!config.productionBrowserSourceMaps,
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
    reactRoot: config.experimental.reactRoot,
    concurrentFeatures: config.experimental.concurrentFeatures,
    swcMinify: config.experimental.swcMinify,
    swcLoader: config.experimental.swcLoader,
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
    rootDirectory: dir,
    customAppFile: new RegExp(escapeRegExp(path.join(pagesDir, `_app`))),
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
    // CRA prevents loading all locales by default
    // https://github.com/facebook/create-react-app/blob/fddce8a9e21bf68f37054586deb0c8636a45f50b/packages/react-scripts/config/webpack.config.js#L721
    webpackConfig.plugins.push(
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/)
    )

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
      webpackConfig.optimization.minimizer =
        webpackConfig.optimization.minimizer.filter(
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

      for (const name of Object.keys(entry)) {
        entry[name] = finalizeEntrypoint(name, entry[name], isServer)
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
