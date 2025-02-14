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
import type { ExpireTime } from './lib/revalidate'
import type { SupportedTestRunners } from '../cli/next-test'
import type { ExperimentalPPRConfig } from './lib/experimental/ppr'
import { INFINITE_CACHE } from '../lib/constants'

export type NextConfigComplete = Required<NextConfig> & {
  images: Required<ImageConfigComplete>
  typescript: Required<TypeScriptConfig>
  configOrigin?: string
  configFile?: string
  configFileName: string
  // override NextConfigComplete.experimental.htmlLimitedBots to string
  // because it's not defined in NextConfigComplete.experimental
  experimental: Omit<ExperimentalConfig, 'htmlLimitedBots'> & {
    htmlLimitedBots: string | undefined
  }
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

export interface ESLintConfig {
  /** Only run ESLint on these directories with `next lint` and `next build`. */
  dirs?: string[]
  /** Do not run ESLint during production builds (`next build`). */
  ignoreDuringBuilds?: boolean
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

type JSONValue =
  | string
  | number
  | boolean
  | JSONValue[]
  | { [k: string]: JSONValue }

export type TurboLoaderItem =
  | string
  | {
      loader: string
      // At the moment, Turbopack options must be JSON-serializable, so restrict values.
      options: Record<string, JSONValue>
    }

export type TurboRuleConfigItemOrShortcut =
  | TurboLoaderItem[]
  | TurboRuleConfigItem

export type TurboRuleConfigItemOptions = {
  loaders: TurboLoaderItem[]
  as?: string
}

export type TurboRuleConfigItem =
  | TurboRuleConfigItemOptions
  | { [condition: string]: TurboRuleConfigItem }
  | false

export interface ExperimentalTurboOptions {
  /**
   * (`next --turbopack` only) A mapping of aliased imports to modules to load in their place.
   *
   * @see [Resolve Alias](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#resolve-alias)
   */
  resolveAlias?: Record<
    string,
    string | string[] | Record<string, string | string[]>
  >

  /**
   * (`next --turbopack` only) A list of extensions to resolve when importing files.
   *
   * @see [Resolve Extensions](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#resolve-extensions)
   */
  resolveExtensions?: string[]

  /**
   * (`next --turbopack` only) A list of webpack loaders to apply when running with Turbopack.
   *
   * @see [Turbopack Loaders](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders)
   */
  loaders?: Record<string, TurboLoaderItem[]>

  /**
   * (`next --turbopack` only) A list of webpack loaders to apply when running with Turbopack.
   *
   * @see [Turbopack Loaders](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders)
   */
  rules?: Record<string, TurboRuleConfigItemOrShortcut>

  /**
   * A target memory limit for turbo, in bytes.
   */
  memoryLimit?: number

  /**
   * Enable persistent caching for the turbopack dev server and build.
   */
  unstablePersistentCaching?: boolean

  /**
   * Enable tree shaking for the turbopack dev server and build.
   */
  treeShaking?: boolean

  /**
   * The module ID strategy to use for Turbopack.
   * If not set, the default is `'named'` for development and `'deterministic'`
   * for production.
   */
  moduleIdStrategy?: 'named' | 'deterministic'

  /**
   * This is the repo root usually and only files above this
   * directory can be resolved by turbopack.
   */
  root?: string

  /**
   * Enable minification. Defaults to true in build mode and false in dev mode.
   */
  minify?: boolean

  /**
   * Enable source maps. Defaults to true.
   */
  sourceMaps?: boolean
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
 * Set of options for the react compiler next.js
 * currently supports.
 *
 * This can be changed without breaking changes while supporting
 * react compiler in the experimental phase.
 */
export interface ReactCompilerOptions {
  compilationMode?: 'infer' | 'annotation' | 'all'
  panicThreshold?: 'ALL_ERRORS' | 'CRITICAL_ERRORS' | 'NONE'
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
  nodeMiddleware?: boolean
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
  clientSegmentCache?: boolean
  appDocumentPreloading?: boolean
  preloadEntriesOnStart?: boolean
  /** @default true */
  strictNextHead?: boolean
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
  externalMiddlewareRewritesResolve?: boolean
  extensionAlias?: Record<string, any>
  allowedRevalidateHeaderKeys?: string[]
  fetchCacheKeyPrefix?: string
  imgOptConcurrency?: number | null
  imgOptTimeoutInSeconds?: number
  imgOptMaxInputPixels?: number
  imgOptSequentialRead?: boolean | null
  optimisticClientCache?: boolean
  /**
   * @deprecated use config.expireTime instead
   */
  expireTime?: ExpireTime
  middlewarePrefetch?: 'strict' | 'flexible'
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
  amp?: {
    optimizer?: any
    validator?: string
    skipValidation?: boolean
  }
  disableOptimizedLoading?: boolean
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

  turbo?: ExperimentalTurboOptions

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
   * Generate Route types and enable type checking for Link and Router.push, etc.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/typedRoutes
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
   * Enables experimental Partial Prerendering feature of Next.js.
   * Using this feature will enable the `react@experimental` for the `app` directory.
   */
  ppr?: ExperimentalPPRConfig

  /**
   * Enables experimental taint APIs in React.
   * Using this feature will enable the `react@experimental` for the `app` directory.
   */
  taint?: boolean

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

  useWasmBinary?: boolean

  /**
   * Use lightningcss instead of postcss-loader
   */
  useLightningcss?: boolean

  /**
   * Enables early import feature for app router modules
   */
  useEarlyImport?: boolean

  /**
   * Enables view transitions by using the {@link https://github.com/facebook/react/pull/31975 unstable_ViewTransition} Component.
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
   * Enable experimental React compiler optimization.
   * Configuration accepts partial config object to the compiler, if provided
   * compiler will be enabled.
   */
  reactCompiler?: boolean | ReactCompilerOptions

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
   * When enabled will cause IO in App Router to be excluded from prerenders
   * unless explicitly cached.
   */
  dynamicIO?: boolean

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
   * Enables the new dev overlay.
   */
  newDevOverlay?: boolean

  /**
   * When enabled will cause async metadata calls to stream rather than block the render.
   */
  streamingMetadata?: boolean

  /**
   * User Agent of bots that can handle streaming metadata.
   * Besides the default behavior, Next.js act differently on serving metadata to bots based on their capability.
   */
  htmlLimitedBots?: RegExp

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
    _fallbackRouteParams?: readonly string[]

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
     * When true, it indicates that this page is being rendered in an attempt to
     * discover if the page will be safe to generate with PPR. This is only
     * enabled when the app has `experimental.dynamicIO` enabled but does not
     * have `experimental.ppr` enabled.
     *
     * @internal
     */
    _isProspectiveRender?: boolean
  }
}

/**
 * Next.js can be configured through a `next.config.js` file in the root of your project directory.
 *
 * This can change the behavior, enable experimental features, and configure other advanced options.
 *
 * Read more: [Next.js Docs: `next.config.js`](https://nextjs.org/docs/app/api-reference/config/next-config-js)
 */
export interface NextConfig extends Record<string, any> {
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
   * @since version 11
   * @see [ESLint configuration](https://nextjs.org/docs/app/api-reference/config/eslint)
   */
  eslint?: ESLintConfig

  /**
   * @see [Next.js TypeScript documentation](https://nextjs.org/docs/app/api-reference/config/typescript)
   */
  typescript?: TypeScriptConfig

  /**
   * Headers allow you to set custom HTTP headers for an incoming request path.
   *
   * @see [Headers configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
   */
  headers?: () => Promise<Header[]>

  /**
   * Rewrites allow you to map an incoming request path to a different destination path.
   *
   * @see [Rewrites configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
   */
  rewrites?: () => Promise<
    | Rewrite[]
    | {
        beforeFiles: Rewrite[]
        afterFiles: Rewrite[]
        fallback: Rewrite[]
      }
  >

  /**
   * Redirects allow you to redirect an incoming request path to a different destination path.
   *
   * @see [Redirects configuration documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)
   */
  redirects?: () => Promise<Redirect[]>

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
  devIndicators?: {
    /** Show "building..."" indicator in development */
    buildActivity?: boolean
    /** Position of "building..." indicator in browser */
    buildActivityPosition?:
      | 'bottom-right'
      | 'bottom-left'
      | 'top-right'
      | 'top-left'

    appIsrStatus?: boolean
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

  /** @see [`next/amp`](https://nextjs.org/docs/api-reference/next/amp) */
  amp?: {
    canonicalBase?: string
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
   * Add public (in browser) runtime configuration to your app
   *
   * @see [Runtime configuration](https://nextjs.org/docs/pages/api-reference/config/next-config-js/runtime-configuration
   */
  publicRuntimeConfig?: { [key: string]: any }

  /**
   * Add server runtime configuration to your app
   *
   * @see [Runtime configuration](https://nextjs.org/docs/pages/api-reference/config/next-config-js/runtime-configuration
   */
  serverRuntimeConfig?: { [key: string]: any }

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

  skipMiddlewareUrlNormalize?: boolean

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
   * period (in seconds) where the server allow to serve stale cache
   */
  expireTime?: ExpireTime

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
}

export const defaultConfig: NextConfig = {
  env: {},
  webpack: null,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
    tsconfigPath: 'tsconfig.json',
  },
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
    appIsrStatus: true,
    buildActivity: true,
    buildActivityPosition: 'bottom-right',
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 5,
  },
  amp: {
    canonicalBase: '',
  },
  basePath: '',
  sassOptions: {},
  trailingSlash: false,
  i18n: null,
  productionBrowserSourceMaps: false,
  excludeDefaultMomentLocales: true,
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactProductionProfiling: false,
  reactStrictMode: null,
  reactMaxHeadersLength: 6000,
  httpAgentOptions: {
    keepAlive: true,
  },
  logging: {},
  expireTime: process.env.__NEXT_TEST_MODE ? undefined : 31536000,
  staticPageGenerationTimeout: 60,
  output: !!process.env.NEXT_PRIVATE_STANDALONE ? 'standalone' : undefined,
  modularizeImports: undefined,
  outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
  experimental: {
    nodeMiddleware: false,
    cacheLife: {
      default: {
        stale: undefined, // defaults to staleTimes.static
        revalidate: 60 * 15, // 15 minutes
        expire: INFINITE_CACHE,
      },
      seconds: {
        stale: undefined, // defaults to staleTimes.dynamic
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
        expire: INFINITE_CACHE, // Unbounded.
      },
    },
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
    clientSegmentCache: false,
    appDocumentPreloading: undefined,
    preloadEntriesOnStart: true,
    clientRouterFilter: true,
    clientRouterFilterRedirects: false,
    fetchCacheKeyPrefix: '',
    middlewarePrefetch: 'flexible',
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
    amp: undefined,
    urlImports: undefined,
    turbo: undefined,
    typedRoutes: false,
    typedEnv: false,
    clientTraceMetadata: undefined,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    ppr:
      // TODO: remove once we've made PPR default
      // If we're testing, and the `__NEXT_EXPERIMENTAL_PPR` environment variable
      // has been set to `true`, enable the experimental PPR feature so long as it
      // wasn't explicitly disabled in the config.
      !!(
        process.env.__NEXT_TEST_MODE &&
        process.env.__NEXT_EXPERIMENTAL_PPR === 'true'
      ),
    authInterrupts: false,
    webpackBuildWorker: undefined,
    webpackMemoryOptimizations: false,
    optimizeServerReact: true,
    useEarlyImport: false,
    viewTransition: false,
    staleTimes: {
      dynamic: 0,
      static: 300,
    },
    allowDevelopmentBuild: undefined,
    reactCompiler: undefined,
    staticGenerationRetryCount: undefined,
    serverComponentsHmrCache: true,
    staticGenerationMaxConcurrency: 8,
    staticGenerationMinPagesPerWorker: 25,
    dynamicIO: false,
    inlineCss: false,
    newDevOverlay: true,
    streamingMetadata: false,
    htmlLimitedBots: undefined,
    useCache: undefined,
    slowModuleDetection: undefined,
  },
  bundlePagesRouterDependencies: false,
}

export async function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })
  }
  // Support `new Promise` and `async () =>` as return values of the config export
  return await config
}
