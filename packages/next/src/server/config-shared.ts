import os from 'os'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Header, Redirect, Rewrite } from '../lib/load-custom-routes'
import { imageConfigDefault } from '../shared/lib/image-config'
import type {
  ImageConfig,
  ImageConfigComplete,
} from '../shared/lib/image-config'
import type { SubresourceIntegrityAlgorithm } from '../build/webpack/plugins/subresource-integrity-plugin'
import type { WEB_VITALS } from '../shared/lib/utils'
import type { NextParsedUrlQuery } from './request-meta'
import type { SizeLimit } from '../types'
import type { SupportedTestRunners } from '../cli/next-test'
import type { ExperimentalPPRConfig } from './lib/experimental/ppr'
import { INFINITE_CACHE } from '../lib/constants'
import { isStableBuild } from '../shared/lib/errors/canary-only-config-error'
import type { FallbackRouteParam } from '../build/static-paths/types'

export type NextConfigComplete = Required<Omit<NextConfig, 'configFile'>> & {
  images: Required<ImageConfigComplete>
  typescript: TypeScriptConfig
  configFile: string | undefined
  configFileName: string
  // override NextConfigComplete.experimental.htmlLimitedBots to string
  // because it's not defined in NextConfigComplete.experimental
  htmlLimitedBots: string | undefined
  experimental: ExperimentalConfig
  // The root directory of the distDir. Generally the same as `distDir` but when `isolatedDevBuild`
  // is true it is the parent directory of `distDir`.  This is used to ensure that the bundler doesn't
  // traverse into the output directory.
  distDirRoot: string
}

export type I18NDomains = readonly DomainLocale[]

export interface I18NConfig {
  defaultLocale: string
  domains?: I18NDomains
  localeDetection?: false
  locales: readonly string[]
}

export interface DomainLocale {
  defaultLocale: string
  domain: string
  http?: true
  locales?: readonly string[]
}

export interface TypeScriptConfig {
  /** Do not run TypeScript during production builds (`next build`). */
  ignoreBuildErrors?: boolean
  /** Relative path to a custom tsconfig file */
  tsconfigPath?: string
}

export interface EmotionConfig {
  sourceMap?: boolean
  autoLabel?: 'dev-only' | 'always' | 'never'
  labelFormat?: string
  importMap?: {
    [importName: string]: {
      [exportName: string]: {
        canonicalImport?: [string, string]
        styledBaseImport?: [string, string]
      }
    }
  }
}

export interface StyledComponentsConfig {
  /**
   * Enabled by default in development, disabled in production to reduce file size,
   * setting this will override the default for all environments.
   */
  displayName?: boolean
  topLevelImportPaths?: string[]
  ssr?: boolean
  fileName?: boolean
  meaninglessFileNames?: string[]
  minify?: boolean
  transpileTemplateLiterals?: boolean
  namespace?: string
  pure?: boolean
  cssProp?: boolean
}

export type JSONValue =
  | string
  | number
  | boolean
  | JSONValue[]
  | { [k: string]: JSONValue }

// At the moment, Turbopack options must be JSON-serializable, so restrict values.
export type TurbopackLoaderOptions = Record<string, JSONValue>

export type TurbopackLoaderItem =
  | string
  | {
      loader: string
      options?: TurbopackLoaderOptions
    }

export type TurbopackLoaderBuiltinCondition =
  | 'browser'
  | 'foreign'
  | 'development'
  | 'production'
  | 'node'
  | 'edge-light'

export type TurbopackRuleCondition =
  | { all: TurbopackRuleCondition[] }
  | { any: TurbopackRuleCondition[] }
  | { not: TurbopackRuleCondition }
  | TurbopackLoaderBuiltinCondition
  | {
      path?: string | RegExp
      content?: RegExp
    }

export type TurbopackRuleConfigItem = {
  loaders: TurbopackLoaderItem[]
  as?: string
  condition?: TurbopackRuleCondition
}

/**
 * This can be an object representing a single configuration, or a list of
 * loaders and/or rule configuration objects.
 *
 * - A list of loader path strings or objects is the "shorthand" syntax.
 * - A list of rule configuration objects can be useful when each configuration
 *   object has different `condition` fields, but still match the same top-level
 *   path glob.
 */
export type TurbopackRuleConfigCollection =
  | TurbopackRuleConfigItem
  | (TurbopackLoaderItem | TurbopackRuleConfigItem)[]

export interface TurbopackOptions {
  /**
   * (`next --turbopack` only) A mapping of aliased imports to modules to load in their place.
   *
   * @see [Resolve Alias](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#resolving-aliases)
   */
  resolveAlias?: Record<
    string,
    string | string[] | Record<string, string | string[]>
  >

  /**
   * (`next --turbopack` only) A list of extensions to resolve when importing files.
   *
   * @see [Resolve Extensions](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#resolving-custom-extensions)
   */
  resolveExtensions?: string[]

  /**
   * (`next --turbopack` only) A list of webpack loaders to apply when running with Turbopack.
   *
   * @see [Turbopack Loaders](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders)
   */
  rules?: Record<string, TurbopackRuleConfigCollection>

  /**
   * This is the repo root usually and only files above this
   * directory can be resolved by turbopack.
   */
  root?: string

  /**
   * Enables generation of debug IDs in JavaScript bundles and source maps.
   * These debug IDs help with debugging and error tracking by providing stable identifiers.
   *
   * @see https://github.com/tc39/ecma426/blob/main/proposals/debug-id.md TC39 Debug ID Proposal
   */
  debugIds?: boolean
}

export interface WebpackConfigContext {
  /** Next.js root directory */
  dir: string
  /** Indicates if the compilation will be done in development */
  dev: boolean
  /** It's `true` for server-side compilation, and `false` for client-side compilation */
  isServer: boolean
  /**  The build id, used as a unique identifier between builds */
  buildId: string
  /** The next.config.js merged with default values */
  config: NextConfigComplete
  /** Default loaders used internally by Next.js */
  defaultLoaders: {
    /** Default babel-loader configuration */
    babel: any
  }
  /** Number of total Next.js pages */
  totalPages: number
  /** The webpack configuration */
  webpack: any
  /** The current server runtime */
  nextRuntime?: 'nodejs' | 'edge'
}

export interface NextJsWebpackConfig {
  (
    /** Existing Webpack config */
    config: any,
    context: WebpackConfigContext
  ): any
}

/**
 * Set of options for React Compiler that Next.js currently supports.
 *
 * These options may be changed in breaking ways at any time without notice
 * while support for React Compiler is experimental.
 *
 * @see https://react.dev/reference/react-compiler/configuration
 */
export interface ReactCompilerOptions {
  /**
   * Controls the strategy for determining which functions the React Compiler
   * will optimize.
   *
   * The default is `'infer'`, which uses intelligent heuristics to identify
   * React components and hooks.
   *
   * When using `infer`, Next.js applies its own heuristics before calling
   * `react-compiler`. This improves compilation performance by avoiding extra
   * invocations of Babel and reducing redundant parsing of code.
   *
   * @see https://react.dev/reference/react-compiler/compilationMode
   */
  compilationMode?: 'infer' | 'annotation' | 'all'
  /**
   * Controls how the React Compiler handles errors during compilation.
   *
   * The default is `'none'`, which skips components which cannot be compiled.
   *
   * @see https://react.dev/reference/react-compiler/panicThreshold
   */
  panicThreshold?: 'none' | 'critical_errors' | 'all_errors'
}

export interface IncomingRequestLoggingConfig {
  /**
   * A regular expression array to match incoming requests that should not be logged.
   * You can specify multiple patterns to match incoming requests that should not be logged.
   */
  ignore?: RegExp[]
}

export interface LoggingConfig {
  fetches?: {
    fullUrl?: boolean
    /**
     * If true, fetch requests that are restored from the HMR cache are logged
     * during an HMR refresh request, i.e. when editing a server component.
     */
    hmrRefreshes?: boolean
  }

  /**
   * If set to false, incoming request logging is disabled.
   * You can specify a pattern to match incoming requests that should not be logged.
   */
  incomingRequests?: boolean | IncomingRequestLoggingConfig
}

export interface ExperimentalConfig {
  adapterPath?: string
  useSkewCookie?: boolean
  cacheHandlers?: {
    default?: string
    remote?: string
    static?: string
    [handlerName: string]: string | undefined
  }
  multiZoneDraftMode?: boolean
  appNavFailHandling?: boolean
  prerenderEarlyExit?: boolean
  linkNoTouchStart?: boolean
  caseSensitiveRoutes?: boolean
  clientSegmentCache?: boolean | 'client-only'

  /**
   * The origins that are allowed to write the rewritten headers when
   * performing a non-relative rewrite. When undefined, no non-relative
   * rewrites will get the rewrite headers.
   */
  clientParamParsingOrigins?: string[]
  dynamicOnHover?: boolean
  preloadEntriesOnStart?: boolean
  clientRouterFilter?: boolean
  clientRouterFilterRedirects?: boolean
  /**
   * This config can be used to override the cache behavior for the client router.
   * These values indicate the time, in seconds, that the cache should be considered
   * reusable. When the `prefetch` Link prop is left unspecified, this will use the `dynamic` value.
   * When the `prefetch` Link prop is set to `true`, this will use the `static` value.
   */
  staleTimes?: {
    dynamic?: number
    static?: number
  }
  /**
   * @deprecated use top-level `cacheLife` instead
   */
  cacheLife?: {
    [profile: string]: {
      // How long the client can cache a value without checking with the server.
      stale?: number
      // How frequently you want the cache to refresh on the server.
      // Stale values may be served while revalidating.
      revalidate?: number
      // In the worst case scenario, where you haven't had traffic in a while,
      // how stale can a value be until you prefer deopting to dynamic.
      // Must be longer than revalidate.
      expire?: number
    }
  }
  // decimal for percent for possible false positives
  // e.g. 0.01 for 10% potential false matches lower
  // percent increases size of the filter
  clientRouterFilterAllowedRate?: number
  /**
   * @deprecated Use `externalProxyRewritesResolve` instead.
   */
  externalMiddlewareRewritesResolve?: boolean
  externalProxyRewritesResolve?: boolean
  extensionAlias?: Record<string, any>
  allowedRevalidateHeaderKeys?: string[]
  fetchCacheKeyPrefix?: string
  imgOptConcurrency?: number | null
  imgOptTimeoutInSeconds?: number
  imgOptMaxInputPixels?: number
  imgOptSequentialRead?: boolean | null
  imgOptSkipMetadata?: boolean | null
  optimisticClientCache?: boolean
  /**
   * @deprecated use config.expireTime instead
   */
  expireTime?: number
  /**
   * @deprecated Use `proxyPrefetch` instead.
   */
  middlewarePrefetch?: 'strict' | 'flexible'
  proxyPrefetch?: 'strict' | 'flexible'
  manualClientBasePath?: boolean
  /**
   * CSS Chunking strategy. Defaults to `true` ("loose" mode), which guesses dependencies
   * between CSS files to keep ordering of them.
   * An alternative is 'strict', which will try to keep correct ordering as
   * much as possible, even when this leads to many requests.
   */
  cssChunking?: boolean | 'strict'
  disablePostcssPresetEnv?: boolean
  cpus?: number
  memoryBasedWorkersCount?: boolean
  proxyTimeout?: number
  isrFlushToDisk?: boolean
  workerThreads?: boolean
  // optimizeCss can be boolean or critters' option object
  // Use Record<string, unknown> as critters doesn't export its Option type
  // https://github.com/GoogleChromeLabs/critters/blob/a590c05f9197b656d2aeaae9369df2483c26b072/packages/critters/src/index.d.ts
  optimizeCss?: boolean | Record<string, unknown>
  nextScriptWorkers?: boolean
  scrollRestoration?: boolean
  externalDir?: boolean
  disableOptimizedLoading?: boolean

  /** @deprecated A no-op as of Next 16, size metrics were removed from the build output. */
  gzipSize?: boolean
  craCompat?: boolean
  esmExternals?: boolean | 'loose'
  fullySpecified?: boolean
  urlImports?: NonNullable<webpack.Configuration['experiments']>['buildHttp']
  swcTraceProfiling?: boolean
  forceSwcTransforms?: boolean

  swcPlugins?: Array<[string, Record<string, unknown>]>
  largePageDataBytes?: number
  /**
   * If set to `false`, webpack won't fall back to polyfill Node.js modules in the browser
   * Full list of old polyfills is accessible here:
   * [webpack/webpack#ModuleNotoundError.js#L13-L42](https://github.com/webpack/webpack/blob/2a0536cf510768111a3a6dceeb14cb79b9f59273/lib/ModuleNotFoundError.js#L13-L42)
   */
  fallbackNodePolyfills?: false
  sri?: {
    algorithm?: SubresourceIntegrityAlgorithm
  }

  webVitalsAttribution?: Array<(typeof WEB_VITALS)[number]>

  /**
   * Automatically apply the "modularizeImports" optimization to imports of the specified packages.
   */
  optimizePackageImports?: string[]

  /**
   * Optimize React APIs for server builds.
   */
  optimizeServerReact?: boolean

  /**
   * A target memory limit for turbo, in bytes.
   */
  turbopackMemoryLimit?: number

  /**
   * Enable minification. Defaults to true in build mode and false in dev mode.
   */
  turbopackMinify?: boolean

  /**
   * Enable support for `with {type: "module"}` for ESM imports.
   */
  turbopackImportTypeBytes?: boolean

  /**
   * Enable scope hoisting. Defaults to true in build mode. Always disabled in development mode.
   */
  turbopackScopeHoisting?: boolean

  /**
   * Enable filesystem cache for the turbopack dev server.
   */
  turbopackFileSystemCacheForDev?: boolean

  /**
   * Enable filesystem cache for the turbopack build.
   */
  turbopackFileSystemCacheForBuild?: boolean

  /**
   * Enable source maps. Defaults to true.
   */
  turbopackSourceMaps?: boolean

  /**
   * Enable tree shaking for the turbopack dev server and build.
   */
  turbopackTreeShaking?: boolean

  /**
   * Enable removing unused exports for turbopack dev server and build.
   */
  turbopackRemoveUnusedExports?: boolean

  /**
   * Use the system-provided CA roots instead of bundled CA roots for external HTTPS requests
   * made by Turbopack. Currently this is only used for fetching data from Google Fonts.
   *
   * This may be useful in cases where you or an employer are MITMing traffic.
   *
   * This option is experimental because:
   * - This may cause small performance problems, as it uses [`rustls-native-certs`](
   *   https://github.com/rustls/rustls-native-certs).
   * - In the future, this may become the default, and this option may be eliminated, once
   *   <https://github.com/seanmonstar/reqwest/issues/2159> is resolved.
   *
   * Users who need to configure this behavior system-wide can override the project
   * configuration using the `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` environment
   * variable.
   *
   * This option is ignored on Windows on ARM, where the native TLS implementation is always
   * used.
   *
   * If you need to set a proxy, Turbopack [respects the common `HTTP_PROXY` and `HTTPS_PROXY`
   * environment variable convention](https://docs.rs/reqwest/latest/reqwest/#proxies). HTTP
   * proxies are supported, SOCKS proxies are not currently supported.
   */
  turbopackUseSystemTlsCerts?: boolean

  /**
   * Set this to `false` to disable the automatic configuration of the babel loader when a Babel
   * configuration file is present. This option is enabled by default.
   *
   * If this is set to `false`, but `reactCompiler` is `true`, the built-in Babel will
   * still be configured, but any Babel configuration files on disk will be ignored. If you wish to
   * use React Compiler with a different manually-configured `babel-loader`, you should disable both
   * this and `reactCompiler`.
   */
  turbopackUseBuiltinBabel?: boolean

  /**
   * Set this to `false` to disable the automatic configuration of the sass loader. The sass loader
   * configuration is enabled by default.
   */
  turbopackUseBuiltinSass?: boolean

  /**
   * The module ID strategy to use for Turbopack.
   * If not set, the default is `'named'` for development and `'deterministic'`
   * for production.
   */
  turbopackModuleIds?: 'named' | 'deterministic'

  /**
   * For use with `@next/mdx`. Compile MDX files using the new Rust compiler.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/mdxRs
   */
  mdxRs?:
    | boolean
    | {
        development?: boolean
        jsx?: boolean
        jsxRuntime?: string
        jsxImportSource?: string
        providerImportSource?: string
        mdxType?: 'gfm' | 'commonmark'
      }

  /**
   * Enable type checking for Link and Router.push, etc.
   * @deprecated Use `typedRoutes` instead — this feature is now stable.
   * @see https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links
   */
  typedRoutes?: boolean

  /**
   * Enable type-checking and autocompletion for environment variables.
   *
   * @default false
   */
  typedEnv?: boolean

  /**
   * Runs the compilations for server and edge in parallel instead of in serial.
   * This will make builds faster if there is enough server and edge functions
   * in the application at the cost of more memory.
   *
   * NOTE: This option is only valid when the build process can use workers. See
   * the documentation for `webpackBuildWorker` for more details.
   */
  parallelServerCompiles?: boolean

  /**
   * Runs the logic to collect build traces for the server routes in parallel
   * with other work during the compilation. This will increase the speed of
   * the build at the cost of more memory. This option may incur some additional
   * work compared to if the option was disabled since the work is started
   * before data from the client compilation is available to potentially reduce
   * the amount of code that needs to be traced. Despite that, this may still
   * result in faster builds for some applications.
   *
   * Valid values are:
   * - `true`: Collect the server build traces in parallel.
   * - `false`: Do not collect the server build traces in parallel.
   * - `undefined`: Collect server build traces in parallel only in the `experimental-compile` mode.
   *
   * NOTE: This option is only valid when the build process can use workers. See
   * the documentation for `webpackBuildWorker` for more details.
   */
  parallelServerBuildTraces?: boolean

  /**
   * Run the Webpack build in a separate process to optimize memory usage during build.
   * Valid values are:
   * - `false`: Disable the Webpack build worker
   * - `true`: Enable the Webpack build worker
   * - `undefined`: Enable the Webpack build worker only if the webpack config is not customized
   */
  webpackBuildWorker?: boolean

  /**
   * Enables optimizations to reduce memory usage in Webpack. This reduces the max size of the heap
   * but may increase compile times slightly.
   * Valid values are:
   * - `false`: Disable Webpack memory optimizations (default).
   * - `true`: Enables Webpack memory optimizations.
   */
  webpackMemoryOptimizations?: boolean

  /**
   * The array of the meta tags to the client injected by tracing propagation data.
   */
  clientTraceMetadata?: string[]

  /**
   * @deprecated This configuration option has been merged into `cacheComponents`.
   * The Partial Prerendering feature is still available via `cacheComponents`.
   */
  ppr?: ExperimentalPPRConfig

  /**
   * Enables experimental taint APIs in React.
   * Using this feature will enable the `react@experimental` for the `app` directory.
   */
  taint?: boolean

  /**
   * Uninstalls all "unhandledRejection" and "uncaughtException" listeners from
   * the global process so that we can override the behavior, which in some
   * runtimes is to exit the process.
   *
   * This is experimental until we've considered the impact in various
   * deployment environments.
   */
  removeUncaughtErrorAndRejectionListeners?: boolean

  /**
   * During an RSC request, validates that the request headers match the
   * cache-busting search parameter sent by the client.
   */
  validateRSCRequestHeaders?: boolean

  serverActions?: {
    /**
     * Allows adjusting body parser size limit for server actions.
     */
    bodySizeLimit?: SizeLimit

    /**
     * Allowed origins that can bypass Server Action's CSRF check. This is helpful
     * when you have reverse proxy in front of your app.
     * @example
     * ["my-app.com", "*.my-app.com"]
     */
    allowedOrigins?: string[]
  }

  /**
   * enables the minification of server code.
   */
  serverMinification?: boolean

  /**
   * Enables source maps generation for the server production bundle.
   */
  serverSourceMaps?: boolean

  /**
   * @internal Used by the Next.js internals only.
   */
  trustHostHeader?: boolean
  /**
   * @internal Used by the Next.js internals only.
   */
  isExperimentalCompile?: boolean

  useWasmBinary?: boolean

  /**
   * Use lightningcss instead of postcss-loader
   */
  useLightningcss?: boolean

  /**
   * Enables view transitions by using the {@link https://react.dev/reference/react/ViewTransition ViewTransition} Component.
   */
  viewTransition?: boolean

  /**
   * Enables `fetch` requests to be proxied to the experimental test proxy server
   */
  testProxy?: boolean

  /**
   * Set a default test runner to be used by `next experimental-test`.
   */
  defaultTestRunner?: SupportedTestRunners
  /**
   * Allow NODE_ENV=development even for `next build`.
   */
  allowDevelopmentBuild?: true
  /**
   * @deprecated use `config.bundlePagesRouterDependencies` instead
   *
   */
  bundlePagesExternals?: boolean
  /**
   * @deprecated use `config.serverExternalPackages` instead
   *
   */
  serverComponentsExternalPackages?: string[]

  /**
   * When enabled, in dev mode, Next.js will send React's debug info through the
   * WebSocket connection, instead of including it in the main RSC payload.
   */
  reactDebugChannel?: boolean

  /**
   * @deprecated use top-level `cacheComponents` instead
   */
  cacheComponents?: boolean

  /**
   * The number of times to retry static generation (per page) before giving up.
   */
  staticGenerationRetryCount?: number

  /**
   * The amount of pages to export per worker during static generation.
   */
  staticGenerationMaxConcurrency?: number

  /**
   * The minimum number of pages to be chunked into each export worker.
   */
  staticGenerationMinPagesPerWorker?: number

  /**
   * Allows previously fetched data to be re-used when editing server components.
   */
  serverComponentsHmrCache?: boolean

  /**
   * Render <style> tags inline in the HTML for imported CSS assets.
   * Supports app-router in production mode only.
   */
  inlineCss?: boolean

  // TODO: Remove this config when the API is stable.
  /**
   * This config allows you to enable the experimental navigation API `forbidden` and `unauthorized`.
   */
  authInterrupts?: boolean

  /**
   * Enables the use of the `"use cache"` directive.
   */
  useCache?: boolean

  /**
   * Enables detection and reporting of slow modules during development builds.
   * Enabling this may impact build performance to ensure accurate measurements.
   */
  slowModuleDetection?: {
    /**
     * The time threshold in milliseconds for identifying slow modules.
     * Modules taking longer than this build time threshold will be reported.
     */
    buildTimeThresholdMs: number
  }

  /**
   * Enables using the global-not-found.js file in the app directory
   *
   */
  globalNotFound?: boolean

  /**
   * Enable debug information to be forwarded from browser to dev server stdout/stderr
   */
  browserDebugInfoInTerminal?:
    | boolean
    | {
        /**
         * Option to limit stringification at a specific nesting depth when logging circular objects.
         * @default 5
         */
        depthLimit?: number

        /**
         * Maximum number of properties/elements to stringify when logging objects/arrays with circular references.
         * @default 100
         */
        edgeLimit?: number
        /**
         * Whether to include source location information in debug output when available
         */
        showSourceLocation?: boolean
      }

  /**
   * Enable accessing root params via the `next/root-params` module.
   */
  rootParams?: boolean

  /**
   * Use an isolated directory for development builds to prevent conflicts
   * with production builds. Development builds will use `{distDir}/dev`
   * instead of `{distDir}`.
   */
  isolatedDevBuild?: boolean

  /**
   * Body size limit for request bodies with middleware configured.
   * Defaults to 10MB. Can be specified as a number (bytes) or string (e.g. '5mb').
   *
   * @deprecated Use `proxyClientMaxBodySize` instead.
   */
  middlewareClientMaxBodySize?: SizeLimit

  /**
   * Body size limit for request bodies with proxy configured.
   * Defaults to 10MB. Can be specified as a number (bytes) or string (e.g. '5mb').
   */
  proxyClientMaxBodySize?: SizeLimit

  /**
   * Enable the Model Context Protocol (MCP) server for AI-assisted development.
   * When enabled, Next.js will expose an MCP server at `/_next/mcp` that provides
   * code intelligence and project context to AI assistants.
   *
   * @default true
   */
  mcpServer?: boolean

  /**
   * Acquires a lockfile at `<distDir>/lock` when starting `next dev` or `next
   * build`. Failing to acquire the lock causes the process to exit with an
   * error message.
   *
   * This is because if multiple processes write to the same `distDir` at the
   * same time, it can mangle the state of the directory. Disabling this option
   * is not recommended.
   *
   * @default true
   */
  lockDistDir?: boolean

  /**
   * Hide logs that occur after a render has already aborted.
   * This can help reduce noise in the console when dealing with aborted renders.
   *
   * @default false
   */
  hideLogsAfterAbort?: boolean
}

export type ExportPathMap = {
  [path: string]: {
    page: string
    query?: NextParsedUrlQuery

    /**
     * When true, this indicates that this is a pages router page that should
     * be rendered as a fallback.
     *
     * @internal
     */
    _pagesFallback?: boolean

    /**
     * The locale that this page should be rendered in.
     *
     * @internal
     */
    _locale?: string

    /**
     * The path that was used to generate the page.
     *
     * @internal
     */
    _ssgPath?: string

    /**
     * The parameters that are currently unknown.
     *
     * @internal
     */
    _fallbackRouteParams?: readonly FallbackRouteParam[]

    /**
     * @internal
     */
    _isAppDir?: boolean

    /**
     * @internal
     */
    _isDynamicError?: boolean

    /**
     * @internal
     */
    _isRoutePPREnabled?: boolean

    /**
     * When true, the page is prerendered as a fallback shell, while allowing
     * any dynamic accesses to result in an empty shell. This is the case when
     * the app has `experimental.ppr` and `cacheComponents` enabled, and
     * there are also routes prerendered with a more complete set of params.
     * Prerendering those routes would catch any invalid dynamic accesses.
     *
     * @internal
     */
    _allowEmptyStaticShell?: boolean
  }
}

/**
 * Next.js can be configured through a `next.config.js` file in the root of your project directory.
 *
 * This can change the behavior, enable experimental features, and configure other advanced options.
 *
 * Read more: [Next.js Docs: `next.config.js`](https://nextjs.org/docs/app/api-reference/config/next-config-js)
 */
export interface NextConfig {
  allowedDevOrigins?: string[]

  exportPathMap?: (
    defaultMap: ExportPathMap,
    ctx: {
      dev: boolean
      dir: string
      outDir: string | null
      distDir: string
      buildId: string
    }
  ) => Promise<ExportPathMap> | ExportPathMap

  /**
   * Internationalization configuration
   *
   * @see [Internationalization docs](https://nextjs.org/docs/advanced-features/i18n-routing)
   */
  i18n?: I18NConfig | null

  /**
   * @see [Next.js TypeScript documentation](https://nextjs.org/docs/app/api-reference/config/typescript)
   */
  typescript?: TypeScriptConfig

  /**
   * Enable type checking for Link and Router.push, etc.
   * This feature requires TypeScript in your project.
   *
   * @see [Typed Links documentation](https://nextjs.org/docs/app/api-reference/config/typescript#statically-typed-links)
   */
  typedRoutes?: boolean

  /**
   * Headers allow you to set custom HTTP headers for an incoming request path.
   *
   * @see [Headers configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
   */
  headers?: () => Promise<Header[]> | Header[]

  /**
   * Rewrites allow you to map an incoming request path to a different destination path.
   *
   * @see [Rewrites configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
   */
  rewrites?: () =>
    | Promise<
        | Rewrite[]
        | {
            beforeFiles?: Rewrite[]
            afterFiles?: Rewrite[]
            fallback?: Rewrite[]
          }
      >
    | Rewrite[]
    | {
        beforeFiles?: Rewrite[]
        afterFiles?: Rewrite[]
        fallback?: Rewrite[]
      }

  /**
   * Redirects allow you to redirect an incoming request path to a different destination path.
   *
   * @see [Redirects configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
   */
  redirects?: () => Promise<Redirect[]> | Redirect[]

  /**
   * @see [Moment.js locales excluded by default](https://nextjs.org/docs/upgrading#momentjs-locales-excluded-by-default)
   */
  excludeDefaultMomentLocales?: boolean

  /**
   * Before continuing to add custom webpack configuration to your application make sure Next.js doesn't already support your use-case
   *
   * @see [Custom Webpack Config documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/webpack)
   */
  webpack?: NextJsWebpackConfig | null

  /**
   * By default Next.js will redirect urls with trailing slashes to their counterpart without a trailing slash.
   *
   * @default false
   * @see [Trailing Slash Configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/trailingSlash)
   */
  trailingSlash?: boolean

  /**
   * Next.js comes with built-in support for environment variables
   *
   * @see [Environment Variables documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/env)
   */
  env?: Record<string, string | undefined>

  /**
   * Destination directory (defaults to `.next`)
   */
  distDir?: string

  /**
   * The build output directory (defaults to `.next`) is now cleared by default except for the Next.js caches.
   */
  cleanDistDir?: boolean

  /**
   * To set up a CDN, you can set up an asset prefix and configure your CDN's origin to resolve to the domain that Next.js is hosted on.
   *
   * @see [CDN Support with Asset Prefix](https://nextjs.org/docs/app/api-reference/config/next-config-js/assetPrefix)
   */
  assetPrefix?: string

  /**
   * The default cache handler for the Pages and App Router uses the filesystem cache. This requires no configuration, however, you can customize the cache handler if you prefer.
   *
   * @see [Configuring Caching](https://nextjs.org/docs/app/building-your-application/deploying#configuring-caching) and the [API Reference](https://nextjs.org/docs/app/api-reference/next-config-js/incrementalCacheHandlerPath).
   */
  cacheHandler?: string | undefined

  /**
   * Configure the in-memory cache size in bytes. Defaults to 50 MB.
   * If `cacheMaxMemorySize: 0`, this disables in-memory caching entirely.
   *
   * @see [Configuring Caching](https://nextjs.org/docs/app/building-your-application/deploying#configuring-caching).
   */
  cacheMaxMemorySize?: number

  /**
   * By default, `Next` will serve each file in the `pages` folder under a pathname matching the filename.
   * To disable this behavior and prevent routing based set this to `true`.
   *
   * @default true
   * @see [Disabling file-system routing](https://nextjs.org/docs/advanced-features/custom-server#disabling-file-system-routing)
   */
  useFileSystemPublicRoutes?: boolean

  /**
   * @see [Configuring the build ID](https://nextjs.org/docs/app/api-reference/config/next-config-js/generateBuildId)
   */
  generateBuildId?: () => string | null | Promise<string | null>

  /** @see [Disabling ETag Configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/generateEtags) */
  generateEtags?: boolean

  /** @see [Including non-page files in the pages directory](https://nextjs.org/docs/app/api-reference/config/next-config-js/pageExtensions) */
  pageExtensions?: string[]

  /** @see [Compression documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/compress) */
  compress?: boolean

  /** @see [Disabling x-powered-by](https://nextjs.org/docs/app/api-reference/config/next-config-js/poweredByHeader) */
  poweredByHeader?: boolean

  /** @see [Using the Image Component](https://nextjs.org/docs/app/api-reference/next-config-js/images) */
  images?: ImageConfig

  /** Configure indicators in development environment */
  devIndicators?:
    | false
    | {
        /**
         * Position of the development tools indicator in the browser window.
         * @default "bottom-left"
         * */
        position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
      }

  /**
   * Next.js exposes some options that give you some control over how the server will dispose or keep in memory built pages in development.
   *
   * @see [Configuring `onDemandEntries`](https://nextjs.org/docs/app/api-reference/config/next-config-js/onDemandEntries)
   */
  onDemandEntries?: {
    /** period (in ms) where the server will keep pages in the buffer */
    maxInactiveAge?: number
    /** number of pages that should be kept simultaneously without being disposed */
    pagesBufferLength?: number
  }

  /**
   * A unique identifier for a deployment that will be included in each request's query string or header.
   */
  deploymentId?: string

  /**
   * Deploy a Next.js application under a sub-path of a domain
   *
   * @see [Base path configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)
   */
  basePath?: string

  /** @see [Customizing sass options](https://nextjs.org/docs/app/api-reference/next-config-js/sassOptions) */
  sassOptions?: {
    implementation?: string
    [key: string]: any
  }

  /**
   * Enable browser source map generation during the production build
   *
   * @see [Source Maps](https://nextjs.org/docs/advanced-features/source-maps)
   */
  productionBrowserSourceMaps?: boolean

  /**
   * Enable {@link https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler React Compiler in Next.js}.
   * Configuration accepts partial config object of the Compiler.
   * If provided, the Compiler will be enabled.
   */
  reactCompiler?: boolean | ReactCompilerOptions

  /**
   * Enable react profiling in production
   *
   */
  reactProductionProfiling?: boolean

  /**
   * The Next.js runtime is Strict Mode-compliant.
   *
   * @see [React Strict Mode](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactStrictMode)
   */
  reactStrictMode?: boolean | null

  /**
   * The maximum length of the headers that are emitted by React and added to
   * the response.
   *
   * @see [React Max Headers Length](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactMaxHeadersLength)
   */
  reactMaxHeadersLength?: number

  /**
   * Next.js enables HTTP Keep-Alive by default.
   * You may want to disable HTTP Keep-Alive for certain `fetch()` calls or globally.
   *
   * @see [Disabling HTTP Keep-Alive](https://nextjs.org/docs/app/api-reference/next-config-js/httpAgentOptions)
   */
  httpAgentOptions?: { keepAlive?: boolean }

  /**
   * Timeout after waiting to generate static pages in seconds
   *
   * @default 60
   */
  staticPageGenerationTimeout?: number

  /**
   * Add `"crossorigin"` attribute to generated `<script>` elements generated by `<Head />` or `<NextScript />` components
   *
   *
   * @see [`crossorigin` attribute documentation](https://developer.mozilla.org/docs/Web/HTML/Attributes/crossorigin)
   */
  crossOrigin?: 'anonymous' | 'use-credentials'

  /**
   * Optionally enable compiler transforms
   *
   * @see [Supported Compiler Options](https://nextjs.org/docs/advanced-features/compiler#supported-features)
   */
  compiler?: {
    reactRemoveProperties?:
      | boolean
      | {
          properties?: string[]
        }
    relay?: {
      src: string
      artifactDirectory?: string
      language?: 'typescript' | 'javascript' | 'flow'
      eagerEsModules?: boolean
    }
    removeConsole?:
      | boolean
      | {
          exclude?: string[]
        }
    styledComponents?: boolean | StyledComponentsConfig
    emotion?: boolean | EmotionConfig

    styledJsx?:
      | boolean
      | {
          useLightningcss?: boolean
        }

    /**
     * Replaces variables in your code during compile time. Each key will be
     * replaced with the respective values.
     */
    define?: Record<string, string>

    /**
     * Replaces server-only (Node.js and Edge) variables in your code during compile time.
     * Each key will be replaced with the respective values.
     */
    defineServer?: Record<string, string>

    /**
     * A hook function that executes after production build compilation finishes,
     * but before running post-compilation tasks such as type checking and
     * static page generation.
     */
    runAfterProductionCompile?: (metadata: {
      /**
       * The root directory of the project
       */
      projectDir: string
      /**
       * The build output directory (defaults to `.next`)
       */
      distDir: string
    }) => Promise<void>
  }

  /**
   * The type of build output.
   * - `undefined`: The default build output, `.next` directory, that works with production mode `next start` or a hosting provider like Vercel
   * - `'standalone'`: A standalone build output, `.next/standalone` directory, that only includes necessary files/dependencies. Useful for self-hosting in a Docker container.
   * - `'export'`: An exported build output, `out` directory, that only includes static HTML/CSS/JS. Useful for self-hosting without a Node.js server.
   * @see [Output File Tracing](https://nextjs.org/docs/advanced-features/output-file-tracing)
   * @see [Static HTML Export](https://nextjs.org/docs/advanced-features/static-html-export)
   */
  output?: 'standalone' | 'export'

  /**
   * Automatically transpile and bundle dependencies from local packages (like monorepos) or from external dependencies (`node_modules`). This replaces the
   * `next-transpile-modules` package.
   * @see [transpilePackages](https://nextjs.org/docs/advanced-features/compiler#module-transpilation)
   */
  transpilePackages?: string[]

  /**
   * Options for Turbopack. Temporarily also available as `experimental.turbo` for compatibility.
   */
  turbopack?: TurbopackOptions

  /**
   * @deprecated Use `skipProxyUrlNormalize` instead.
   */
  skipMiddlewareUrlNormalize?: boolean

  skipProxyUrlNormalize?: boolean

  skipTrailingSlashRedirect?: boolean

  modularizeImports?: Record<
    string,
    {
      transform: string | Record<string, string>
      preventFullImport?: boolean
      skipDefaultConversion?: boolean
    }
  >

  /**
   * Logging configuration. Set to `false` to disable logging.
   */
  logging?: LoggingConfig | false

  /**
   * Enables source maps while generating static pages.
   * Helps with errors during the prerender phase in `next build`.
   */
  enablePrerenderSourceMaps?: boolean

  /**
   * When enabled, in development and build, Next.js will automatically cache
   * page-level components and functions for faster builds and rendering. This
   * includes Partial Prerendering support.
   *
   * @see [Cache Components documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
   */
  cacheComponents?: boolean

  cacheLife?: {
    [profile: string]: {
      // How long the client can cache a value without checking with the server.
      stale?: number
      // How frequently you want the cache to refresh on the server.
      // Stale values may be served while revalidating.
      revalidate?: number
      // In the worst case scenario, where you haven't had traffic in a while,
      // how stale can a value be until you prefer deopting to dynamic.
      // Must be longer than revalidate.
      expire?: number
    }
  }

  /**
   * period (in seconds) where the server allow to serve stale cache
   */
  expireTime?: number

  /**
   * Enable experimental features. Note that all experimental features are subject to breaking changes in the future.
   */
  experimental?: ExperimentalConfig

  /**
   * Enables the bundling of node_modules packages (externals) for pages server-side bundles.
   * @see https://nextjs.org/docs/pages/api-reference/next-config-js/bundlePagesRouterDependencies
   */
  bundlePagesRouterDependencies?: boolean

  /**
   * A list of packages that should be treated as external in the server build.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages
   */
  serverExternalPackages?: string[]

  /**
   * This is the repo root usually and only files above this
   * directory are traced and included.
   */
  outputFileTracingRoot?: string

  /**
   * This allows manually excluding traced files if too many
   * are included incorrectly on a per-page basis.
   */
  outputFileTracingExcludes?: Record<string, string[]>

  /**
   * This allows manually including traced files if some
   * were not detected on a per-page basis.
   */
  outputFileTracingIncludes?: Record<string, string[]>

  watchOptions?: {
    pollIntervalMs?: number
  }

  /**
   * User Agent of bots that can handle streaming metadata.
   * Besides the default behavior, Next.js act differently on serving metadata to bots based on their capability.
   *
   * @default
   * /Mediapartners-Google|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview/i
   */
  htmlLimitedBots?: RegExp

  /**
   * @internal
   */
  configFile?: string | undefined

  /**
   * @internal
   */
  configOrigin?: string | undefined

  /**
   * @internal
   */
  _originalRedirects?: any

  /**
   * @internal
   */
  _originalRewrites?: any
}

export const defaultConfig = Object.freeze({
  env: {},
  webpack: null,
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: undefined,
  },
  typedRoutes: false,
  distDir: '.next',
  cleanDistDir: true,
  assetPrefix: '',
  cacheHandler: process.env.NEXT_CACHE_HANDLER_PATH,
  // default to 50MB limit
  cacheMaxMemorySize: 50 * 1024 * 1024,
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  poweredByHeader: true,
  compress: true,
  images: imageConfigDefault,
  devIndicators: {
    position: 'bottom-left',
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  basePath: '',
  sassOptions: {},
  trailingSlash: false,
  i18n: null,
  productionBrowserSourceMaps: false,
  excludeDefaultMomentLocales: true,
  reactProductionProfiling: false,
  reactStrictMode: null,
  reactMaxHeadersLength: 6000,
  httpAgentOptions: {
    keepAlive: true,
  },
  logging: {},
  compiler: {},
  expireTime: process.env.NEXT_PRIVATE_CDN_CONSUMED_SWR_CACHE_CONTROL
    ? undefined
    : 31536000, // one year
  staticPageGenerationTimeout: 60,
  output: !!process.env.NEXT_PRIVATE_STANDALONE ? 'standalone' : undefined,
  modularizeImports: undefined,
  outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
  allowedDevOrigins: undefined,
  // Will default to cacheComponents value.
  enablePrerenderSourceMaps: undefined,
  cacheComponents: false,
  cacheLife: {
    default: {
      stale: undefined, // defaults to staleTimes.static
      revalidate: 60 * 15, // 15 minutes
      expire: INFINITE_CACHE,
    },
    seconds: {
      stale: 30, // 30 seconds
      revalidate: 1, // 1 second
      expire: 60, // 1 minute
    },
    minutes: {
      stale: 60 * 5, // 5 minutes
      revalidate: 60, // 1 minute
      expire: 60 * 60, // 1 hour
    },
    hours: {
      stale: 60 * 5, // 5 minutes
      revalidate: 60 * 60, // 1 hour
      expire: 60 * 60 * 24, // 1 day
    },
    days: {
      stale: 60 * 5, // 5 minutes
      revalidate: 60 * 60 * 24, // 1 day
      expire: 60 * 60 * 24 * 7, // 1 week
    },
    weeks: {
      stale: 60 * 5, // 5 minutes
      revalidate: 60 * 60 * 24 * 7, // 1 week
      expire: 60 * 60 * 24 * 30, // 1 month
    },
    max: {
      stale: 60 * 5, // 5 minutes
      revalidate: 60 * 60 * 24 * 30, // 1 month
      expire: 60 * 60 * 24 * 365, // 1 year
    },
  },
  experimental: {
    adapterPath: process.env.NEXT_ADAPTER_PATH || undefined,
    useSkewCookie: false,
    cacheHandlers: {
      default: process.env.NEXT_DEFAULT_CACHE_HANDLER_PATH,
      remote: process.env.NEXT_REMOTE_CACHE_HANDLER_PATH,
      static: process.env.NEXT_STATIC_CACHE_HANDLER_PATH,
    },
    cssChunking: true,
    multiZoneDraftMode: false,
    appNavFailHandling: false,
    prerenderEarlyExit: true,
    serverMinification: true,
    serverSourceMaps: false,
    linkNoTouchStart: false,
    caseSensitiveRoutes: false,
    clientSegmentCache: true,
    clientParamParsingOrigins: undefined,
    dynamicOnHover: false,
    preloadEntriesOnStart: true,
    clientRouterFilter: true,
    clientRouterFilterRedirects: false,
    fetchCacheKeyPrefix: '',
    proxyPrefetch: 'flexible',
    optimisticClientCache: true,
    manualClientBasePath: false,
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    memoryBasedWorkersCount: false,
    imgOptConcurrency: null,
    imgOptTimeoutInSeconds: 7,
    imgOptMaxInputPixels: 268_402_689, // https://sharp.pixelplumbing.com/api-constructor#:~:text=%5Boptions.limitInputPixels%5D
    imgOptSequentialRead: null,
    imgOptSkipMetadata: null,
    isrFlushToDisk: true,
    workerThreads: false,
    proxyTimeout: undefined,
    optimizeCss: false,
    nextScriptWorkers: false,
    scrollRestoration: false,
    externalDir: false,
    disableOptimizedLoading: false,
    gzipSize: true,
    craCompat: false,
    esmExternals: true,
    fullySpecified: false,
    swcTraceProfiling: false,
    forceSwcTransforms: false,
    swcPlugins: undefined,
    largePageDataBytes: 128 * 1000, // 128KB by default
    disablePostcssPresetEnv: undefined,
    urlImports: undefined,
    typedEnv: false,
    clientTraceMetadata: undefined,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    ppr: false,
    authInterrupts: false,
    webpackBuildWorker: undefined,
    webpackMemoryOptimizations: false,
    optimizeServerReact: true,
    viewTransition: false,
    removeUncaughtErrorAndRejectionListeners: false,
    validateRSCRequestHeaders: !!(
      process.env.__NEXT_TEST_MODE || !isStableBuild()
    ),
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
    allowDevelopmentBuild: undefined,
    reactDebugChannel: false,
    staticGenerationRetryCount: undefined,
    serverComponentsHmrCache: true,
    staticGenerationMaxConcurrency: 8,
    staticGenerationMinPagesPerWorker: 25,
    inlineCss: false,
    useCache: undefined,
    slowModuleDetection: undefined,
    globalNotFound: false,
    browserDebugInfoInTerminal: false,
    lockDistDir: true,
    isolatedDevBuild: true,
    proxyClientMaxBodySize: 10_485_760, // 10MB
    hideLogsAfterAbort: false,
    mcpServer: true,
  },
  htmlLimitedBots: undefined,
  bundlePagesRouterDependencies: false,
} satisfies NextConfig)

export async function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })
  }
  // Support `new Promise` and `async () =>` as return values of the config export
  return await config
}
