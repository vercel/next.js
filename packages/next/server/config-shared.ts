import os from 'os'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { Header, Redirect, Rewrite } from '../lib/load-custom-routes'
import {
  ImageConfig,
  ImageConfigComplete,
  imageConfigDefault,
} from '../shared/lib/image-config'

export type PageRuntime = 'nodejs' | 'edge' | undefined

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
  newNextLinkBehavior?: boolean
  disablePostcssPresetEnv?: boolean
  swcMinify?: boolean
  swcFileReading?: boolean
  cpus?: number
  sharedPool?: boolean
  plugins?: boolean
  profiling?: boolean
  isrFlushToDisk?: boolean
  reactMode?: 'legacy' | 'concurrent' | 'blocking'
  workerThreads?: boolean
  pageEnv?: boolean
  optimizeCss?: boolean
  nextScriptWorkers?: boolean
  scrollRestoration?: boolean
  externalDir?: boolean
  conformance?: boolean
  amp?: {
    optimizer?: any
    validator?: string
    skipValidation?: boolean
  }
  reactRoot?: boolean
  disableOptimizedLoading?: boolean
  gzipSize?: boolean
  craCompat?: boolean
  esmExternals?: boolean | 'loose'
  isrMemoryCacheSize?: number
  runtime?: Exclude<PageRuntime, undefined>
  serverComponents?: boolean
  fullySpecified?: boolean
  urlImports?: NonNullable<webpack5.Configuration['experiments']>['buildHttp']
  outputFileTracingRoot?: string
  outputStandalone?: boolean
  images?: {
    layoutRaw: boolean
  }
  middlewareSourceMaps?: boolean
  emotion?:
    | boolean
    | {
        sourceMap?: boolean
        autoLabel?: 'dev-only' | 'always' | 'never'
        labelFormat?: string
      }
  modularizeImports?: Record<
    string,
    {
      transform: string
      preventFullImport?: boolean
      skipDefaultConversion?: boolean
    }
  >
}

/**
 * Next configuration object
 * @see [configuration documentation](https://nextjs.org/docs/api-reference/next.config.js/introduction)
 */
export interface NextConfig extends Record<string, any> {
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
   * @deprecated This option has been removed as webpack 5 is now default
   * @see [Next.js webpack 5 documentation](https://nextjs.org/docs/messages/webpack5) for upgrading guidance.
   */
  webpack5?: false

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
  reactStrictMode?: boolean

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

  future?: {
    /**
     * @deprecated This option has been removed as webpack 5 is now default
     */
    webpack5?: false
  }

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
      language?: 'typescript' | 'flow'
    }
    removeConsole?:
      | boolean
      | {
          exclude?: string[]
        }
    styledComponents?: boolean
  }

  /**
   * Enable experimental features. Note that all experimental features are subject to breaking changes in the future.
   */
  experimental?: ExperimentalConfig
}

export const defaultConfig: NextConfig = {
  env: {},
  webpack: null,
  webpackDevMiddleware: null,
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
  target: 'server',
  poweredByHeader: true,
  compress: true,
  analyticsId: process.env.VERCEL_ANALYTICS_ID || '',
  images: imageConfigDefault,
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
  webpack5: undefined,
  excludeDefaultMomentLocales: true,
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactStrictMode: false,
  httpAgentOptions: {
    keepAlive: true,
  },
  outputFileTracing: true,
  staticPageGenerationTimeout: 60,
  swcMinify: false,
  experimental: {
    // TODO: change default in next major release (current v12.1.5)
    newNextLinkBehavior: false,
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    sharedPool: true,
    plugins: false,
    profiling: false,
    isrFlushToDisk: true,
    workerThreads: false,
    pageEnv: false,
    optimizeCss: false,
    nextScriptWorkers: false,
    scrollRestoration: false,
    externalDir: false,
    reactRoot: Number(process.env.NEXT_PRIVATE_REACT_ROOT) > 0,
    disableOptimizedLoading: false,
    gzipSize: true,
    swcFileReading: true,
    craCompat: false,
    esmExternals: true,
    // default to 50MB limit
    isrMemoryCacheSize: 50 * 1024 * 1024,
    serverComponents: false,
    fullySpecified: false,
    outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
    outputStandalone: !!process.env.NEXT_PRIVATE_STANDALONE,
    images: {
      layoutRaw: false,
    },
  },
}

export async function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })
  }
  // Support `new Promise` and `async () =>` as return values of the config export
  return await config
}
