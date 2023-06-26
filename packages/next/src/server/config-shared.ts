import os from 'os'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { Header, Redirect, Rewrite } from '../lib/load-custom-routes'
import {
  ImageConfig,
  ImageConfigComplete,
  imageConfigDefault,
} from '../shared/lib/image-config'
import { SubresourceIntegrityAlgorithm } from '../build/webpack/plugins/subresource-integrity-plugin'
import { WEB_VITALS } from '../shared/lib/utils'
import type { NextParsedUrlQuery } from './request-meta'
import { SizeLimit } from '../../types'

export type NextConfigComplete = Required<NextConfig> & {
  images: Required<ImageConfigComplete>
  typescript: Required<TypeScriptConfig>
  configOrigin?: string
  configFile?: string
  configFileName: string
}

export interface I18NConfig {
  defaultLocale: string
  domains?: DomainLocale[]
  localeDetection?: false
  locales: string[]
}

export interface DomainLocale {
  defaultLocale: string
  domain: string
  http?: true
  locales?: string[]
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

type TurboLoaderItem =
  | string
  | {
      loader: string
      // At the moment, Turbopack options must be JSON-serializable, so restrict values.
      options: Record<string, JSONValue>
    }

interface ExperimentalTurboOptions {
  /**
   * (`next --turbo` only) A mapping of aliased imports to modules to load in their place.
   *
   * @see [Resolve Alias](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#resolve-alias)
   */
  resolveAlias?: Record<
    string,
    string | string[] | Record<string, string | string[]>
  >

  /**
   * (`next --turbo` only) A list of webpack loaders to apply when running with Turbopack.
   *
   * @see [Turbopack Loaders](https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders)
   */
  loaders?: Record<string, TurboLoaderItem[]>
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

export interface ExperimentalConfig {
  caseSensitiveRoutes?: boolean
  useDeploymentId?: boolean
  useDeploymentIdServerActions?: boolean
  deploymentId?: string
  logging?: 'verbose'
  appDocumentPreloading?: boolean
  strictNextHead?: boolean
  clientRouterFilter?: boolean
  clientRouterFilterRedirects?: boolean
  // decimal for percent for possible false positives
  // e.g. 0.01 for 10% potential false matches lower
  // percent increases size of the filter
  clientRouterFilterAllowedRate?: number
  externalMiddlewareRewritesResolve?: boolean
  extensionAlias?: Record<string, any>
  allowedRevalidateHeaderKeys?: string[]
  fetchCacheKeyPrefix?: string
  optimisticClientCache?: boolean
  middlewarePrefetch?: 'strict' | 'flexible'
  legacyBrowsers?: boolean
  manualClientBasePath?: boolean
  newNextLinkBehavior?: boolean
  // custom path to a cache handler to use
  incrementalCacheHandlerPath?: string
  disablePostcssPresetEnv?: boolean
  swcMinify?: boolean
  swcFileReading?: boolean
  cpus?: number
  memoryBasedWorkersCount?: boolean
  sharedPool?: boolean
  proxyTimeout?: number
  isrFlushToDisk?: boolean
  workerThreads?: boolean
  pageEnv?: boolean
  // optimizeCss can be boolean or critters' option object
  // Use Record<string, unknown> as critters doesn't export its Option type
  // https://github.com/GoogleChromeLabs/critters/blob/a590c05f9197b656d2aeaae9369df2483c26b072/packages/critters/src/index.d.ts
  optimizeCss?: boolean | Record<string, unknown>
  nextScriptWorkers?: boolean
  scrollRestoration?: boolean
  externalDir?: boolean
  /**
   * The App Router (app directory) enables support for layouts, Server Components, streaming, and colocated data fetching.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/appDir
   */
  appDir?: boolean
  amp?: {
    optimizer?: any
    validator?: string
    skipValidation?: boolean
  }
  disableOptimizedLoading?: boolean
  gzipSize?: boolean
  craCompat?: boolean
  esmExternals?: boolean | 'loose'
  isrMemoryCacheSize?: number
  fullySpecified?: boolean
  urlImports?: NonNullable<webpack.Configuration['experiments']>['buildHttp']
  outputFileTracingRoot?: string
  outputFileTracingExcludes?: Record<string, string[]>
  outputFileTracingIgnores?: string[]
  outputFileTracingIncludes?: Record<string, string[]>
  swcTraceProfiling?: boolean
  forceSwcTransforms?: boolean

  /**
   * This option is removed
   */
  swcMinifyDebugOptions?: never
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
  adjustFontFallbacks?: boolean
  adjustFontFallbacksWithSizeAdjust?: boolean

  /**
   * A list of packages that should be treated as external in the RSC server build.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/serverComponentsExternalPackages
   */
  serverComponentsExternalPackages?: string[]

  webVitalsAttribution?: Array<(typeof WEB_VITALS)[number]>

  turbo?: ExperimentalTurboOptions
  turbotrace?: {
    logLevel?:
      | 'bug'
      | 'fatal'
      | 'error'
      | 'warning'
      | 'hint'
      | 'note'
      | 'suggestions'
      | 'info'
    logDetail?: boolean
    logAll?: boolean
    contextDirectory?: string
    processCwd?: string
    /** in `MB` */
    memoryLimit?: number
  }

  /**
   * For use with `@next/mdx`. Compile MDX files using the new Rust compiler.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/mdxRs
   */
  mdxRs?: boolean

  /**
   * Generate Route types and enable type checking for Link and Router.push, etc.
   * This option requires `appDir` to be enabled first.
   * @see https://nextjs.org/docs/app/api-reference/next-config-js/typedRoutes
   */
  typedRoutes?: boolean

  /**
   * This option is to enable running the Webpack build in a worker thread.
   */
  webpackBuildWorker?: boolean

  /**
   *
   */
  instrumentationHook?: boolean

  /**
   * Enable `react@experimental` channel for the `app` directory.
   */
  serverActions?: boolean

  /**
   * Allows adjusting body parser size limit for server actions.
   */
  serverActionsBodySizeLimit?: SizeLimit
}

export type ExportPathMap = {
  [path: string]: {
    page: string
    query?: NextParsedUrlQuery
    _isAppDir?: boolean
    _isDynamicError?: boolean
  }
}

/**
 * Next configuration object
 * @see [configuration documentation](https://nextjs.org/docs/api-reference/next.config.js/introduction)
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
   * @see [ESLint configuration](https://nextjs.org/docs/basic-features/eslint)
   */
  eslint?: ESLintConfig

  /**
   * @see [Next.js TypeScript documentation](https://nextjs.org/docs/basic-features/typescript)
   */
  typescript?: TypeScriptConfig

  /**
   * Headers allow you to set custom HTTP headers for an incoming request path.
   *
   * @see [Headers configuration documentation](https://nextjs.org/docs/api-reference/next.config.js/headers)
   */
  headers?: () => Promise<Header[]>

  /**
   * Rewrites allow you to map an incoming request path to a different destination path.
   *
   * @see [Rewrites configuration documentation](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
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
   * @see [Redirects configuration documentation](https://nextjs.org/docs/api-reference/next.config.js/redirects)
   */
  redirects?: () => Promise<Redirect[]>

  /**
   * @see [Moment.js locales excluded by default](https://nextjs.org/docs/upgrading#momentjs-locales-excluded-by-default)
   */
  excludeDefaultMomentLocales?: boolean

  /**
   * Before continuing to add custom webpack configuration to your application make sure Next.js doesn't already support your use-case
   *
   * @see [Custom Webpack Config documentation](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
   */
  webpack?: NextJsWebpackConfig | null

  /**
   * By default Next.js will redirect urls with trailing slashes to their counterpart without a trailing slash.
   *
   * @default false
   * @see [Trailing Slash Configuration](https://nextjs.org/docs/api-reference/next.config.js/trailing-slash)
   */
  trailingSlash?: boolean

  /**
   * Next.js comes with built-in support for environment variables
   *
   * @see [Environment Variables documentation](https://nextjs.org/docs/api-reference/next.config.js/environment-variables)
   */
  env?: Record<string, string>

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
   * @see [CDN Support with Asset Prefix](https://nextjs.org/docs/api-reference/next.config.js/cdn-support-with-asset-prefix)
   */
  assetPrefix?: string

  /**
   * By default, `Next` will serve each file in the `pages` folder under a pathname matching the filename.
   * To disable this behavior and prevent routing based set this to `true`.
   *
   * @default true
   * @see [Disabling file-system routing](https://nextjs.org/docs/advanced-features/custom-server#disabling-file-system-routing)
   */
  useFileSystemPublicRoutes?: boolean

  /**
   * @see [Configuring the build ID](https://nextjs.org/docs/api-reference/next.config.js/configuring-the-build-id)
   */
  generateBuildId?: () => string | null | Promise<string | null>

  /** @see [Disabling ETag Configuration](https://nextjs.org/docs/api-reference/next.config.js/disabling-etag-generation) */
  generateEtags?: boolean

  /** @see [Including non-page files in the pages directory](https://nextjs.org/docs/api-reference/next.config.js/custom-page-extensions) */
  pageExtensions?: string[]

  /** @see [Compression documentation](https://nextjs.org/docs/api-reference/next.config.js/compression) */
  compress?: boolean

  /**
   * The field should only be used when a Next.js project is not hosted on Vercel while using Vercel Speed Insights.
   * Vercel provides zero-configuration insights for Next.js projects hosted on Vercel.
   *
   * @default ''
   * @see [Next.js Speed Insights](https://nextjs.org/analytics)
   */
  analyticsId?: string

  /** @see [Disabling x-powered-by](https://nextjs.org/docs/api-reference/next.config.js/disabling-x-powered-by) */
  poweredByHeader?: boolean

  /** @see [Using the Image Component](https://nextjs.org/docs/basic-features/image-optimization#using-the-image-component) */
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
  }

  /**
   * Disables the automatic minification of server code.
   */
  disableServerMinification?: boolean

  /**
   * Next.js exposes some options that give you some control over how the server will dispose or keep in memory built pages in development.
   *
   * @see [Configuring `onDemandEntries`](https://nextjs.org/docs/api-reference/next.config.js/configuring-onDemandEntries)
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
   * Deploy a Next.js application under a sub-path of a domain
   *
   * @see [Base path configuration](https://nextjs.org/docs/api-reference/next.config.js/basepath)
   */
  basePath?: string

  /** @see [Customizing sass options](https://nextjs.org/docs/basic-features/built-in-css-support#customizing-sass-options) */
  sassOptions?: { [key: string]: any }

  /**
   * Enable browser source map generation during the production build
   *
   * @see [Source Maps](https://nextjs.org/docs/advanced-features/source-maps)
   */
  productionBrowserSourceMaps?: boolean

  /**
   * By default, Next.js will automatically inline font CSS at build time
   *
   * @default true
   * @since version 10.2
   * @see [Font Optimization](https://nextjs.org/docs/basic-features/font-optimization)
   */
  optimizeFonts?: boolean

  /**
   * The Next.js runtime is Strict Mode-compliant.
   *
   * @see [React Strict Mode](https://nextjs.org/docs/api-reference/next.config.js/react-strict-mode)
   */
  reactStrictMode?: boolean | null

  /**
   * Add public (in browser) runtime configuration to your app
   *
   * @see [Runtime configuration](https://nextjs.org/docs/api-reference/next.config.js/runtime-configuration)
   */
  publicRuntimeConfig?: { [key: string]: any }

  /**
   * Add server runtime configuration to your app
   *
   * @see [Runtime configuration](https://nextjs.org/docs/api-reference/next.config.js/runtime-configuration)
   */
  serverRuntimeConfig?: { [key: string]: any }

  /**
   * Next.js automatically polyfills node-fetch and enables HTTP Keep-Alive by default.
   * You may want to disable HTTP Keep-Alive for certain `fetch()` calls or globally.
   *
   * @see [Disabling HTTP Keep-Alive](https://nextjs.org/docs/api-reference/next.config.js/disabling-http-keep-alive)
   */
  httpAgentOptions?: { keepAlive?: boolean }

  /**
   * During a build, Next.js will automatically trace each page and its dependencies to determine all of the files
   * that are needed for deploying a production version of your application.
   *
   * @see [Output File Tracing](https://nextjs.org/docs/advanced-features/output-file-tracing)
   */
  outputFileTracing?: boolean

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
   * @see [`crossorigin` attribute documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/crossorigin)
   */
  crossOrigin?: false | 'anonymous' | 'use-credentials'

  /**
   * Use [SWC compiler](https://swc.rs) to minify the generated JavaScript
   *
   * @see [SWC Minification](https://nextjs.org/docs/advanced-features/compiler#minification)
   */
  swcMinify?: boolean

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
      transform: string
      preventFullImport?: boolean
      skipDefaultConversion?: boolean
    }
  >

  /**
   * Enable experimental features. Note that all experimental features are subject to breaking changes in the future.
   */
  experimental?: ExperimentalConfig
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
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  poweredByHeader: true,
  compress: true,
  analyticsId: process.env.VERCEL_ANALYTICS_ID || '',
  images: imageConfigDefault,
  disableServerMinification: false,
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-right',
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 2,
  },
  amp: {
    canonicalBase: '',
  },
  basePath: '',
  sassOptions: {},
  trailingSlash: false,
  i18n: null,
  productionBrowserSourceMaps: false,
  optimizeFonts: true,
  excludeDefaultMomentLocales: true,
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactStrictMode: false,
  httpAgentOptions: {
    keepAlive: true,
  },
  outputFileTracing: true,
  staticPageGenerationTimeout: 60,
  swcMinify: true,
  output: !!process.env.NEXT_PRIVATE_STANDALONE ? 'standalone' : undefined,
  modularizeImports: undefined,
  experimental: {
    caseSensitiveRoutes: false,
    useDeploymentId: false,
    deploymentId: undefined,
    useDeploymentIdServerActions: false,
    appDocumentPreloading: undefined,
    clientRouterFilter: false,
    clientRouterFilterRedirects: false,
    fetchCacheKeyPrefix: '',
    middlewarePrefetch: 'flexible',
    optimisticClientCache: true,
    manualClientBasePath: false,
    legacyBrowsers: false,
    newNextLinkBehavior: true,
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    memoryBasedWorkersCount: false,
    sharedPool: true,
    isrFlushToDisk: true,
    workerThreads: false,
    pageEnv: false,
    proxyTimeout: undefined,
    optimizeCss: false,
    nextScriptWorkers: false,
    scrollRestoration: false,
    externalDir: false,
    disableOptimizedLoading: false,
    gzipSize: true,
    swcFileReading: true,
    craCompat: false,
    esmExternals: true,
    appDir: true,
    // default to 50MB limit
    isrMemoryCacheSize: 50 * 1024 * 1024,
    incrementalCacheHandlerPath: undefined,
    fullySpecified: false,
    outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
    swcTraceProfiling: false,
    forceSwcTransforms: false,
    swcPlugins: undefined,
    largePageDataBytes: 128 * 1000, // 128KB by default
    disablePostcssPresetEnv: undefined,
    amp: undefined,
    urlImports: undefined,
    adjustFontFallbacks: false,
    adjustFontFallbacksWithSizeAdjust: false,
    turbo: undefined,
    turbotrace: undefined,
    typedRoutes: false,
    instrumentationHook: false,
  },
}

export async function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })
  }
  // Support `new Promise` and `async () =>` as return values of the config export
  return await config
}

export function validateConfig(userConfig: NextConfig): {
  errors?: Array<any> | null
} {
  const configValidator = require('next/dist/next-config-validate.js')
  configValidator(userConfig)
  return {
    errors: configValidator.errors,
  }
}
