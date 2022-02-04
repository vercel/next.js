import os from 'os'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { Header, Redirect, Rewrite } from '../lib/load-custom-routes'
import {
  ImageConfig,
  ImageConfigComplete,
  imageConfigDefault,
} from './image-config'

export type NextConfigComplete = Required<NextConfig> & {
  images: ImageConfigComplete
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
}

export interface NextJsWebpackConfig {
  (
    /** Existing Webpack config */
    config: any,
    context: WebpackConfigContext
  ): any
}

export type NextConfig = { [key: string]: any } & {
  i18n?: I18NConfig | null

  eslint?: ESLintConfig
  typescript?: TypeScriptConfig

  /**
   * Headers allow you to set custom HTTP headers for an incoming request path.
   *
   * Refer to complete [Headers configuration documentations](https://nextjs.org/docs/api-reference/next.config.js/headers)
   */
  headers?: () => Promise<Header[]>

  /**
   * Rewrites allow you to map an incoming request path to a different destination path.
   *
   * Rewrites act as a URL proxy and mask the destination path, making it appear the user hasn't changed their location on the site.
   * In contrast, redirects will reroute to a new page and show the URL changes
   *
   * Refer to complete [Rewrites configuration documentations](https://nextjs.org/docs/api-reference/next.config.js/rewrites)
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
   * Redirects are only available on the Node.js environment and do not affect client-side routing.
   *
   * Refer to complete [Redirects configuration documentations](https://nextjs.org/docs/api-reference/next.config.js/redirects)
   */
  redirects?: () => Promise<Redirect[]>

  /**
   * @deprecated This option has been removed as webpack 5 is now default
   * Webpack 5 is now the default for all Next.js applications. If you did not have custom webpack configuration your application is already using webpack 5.
   * If you do have custom webpack configuration you can refer to the [Next.js webpack 5 documentation](https://nextjs.org/docs/messages/webpack5) for upgrading guidance.
   */
  webpack5?: false

  /**
   * Moment.js includes translations for a lot of locales by default. Next.js now automatically excludes these locales by default
   * to optimize bundle size for applications using Moment.js.
   *
   * To load a specific locale use this snippet:
   *
   * ```js
   * import moment from 'moment'
   * import 'moment/locale/ja'
   *
   * moment.locale('ja')
   * ```
   *
   * You can opt-out of this new default by adding `excludeDefaultMomentLocales: false` to `next.config.js` if you do not want the new behavior,
   * do note it's highly recommended to not disable this new optimization as it significantly reduces the size of Moment.js.
   */
  excludeDefaultMomentLocales?: boolean

  /**
   * Before continuing to add custom webpack configuration to your application make sure Next.js doesn't already support your use-case
   *
   * Refer to complete [Custom Webpack Config documentation](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
   *
   */
  webpack?: NextJsWebpackConfig | null

  /**
   * By default Next.js will redirect urls with trailing slashes to their counterpart without a trailing slash.
   * For example /about/ will redirect to /about. You can configure this behavior to act the opposite way,
   * where urls without trailing slashes are redirected to their counterparts with trailing slashes.
   *
   * Refer to complete [Trailing Slash Configuration](https://nextjs.org/docs/api-reference/next.config.js/trailing-slash)
   */
  trailingSlash?: boolean

  /**
   * Next.js comes with built-in support for environment variables, which allows you to do the following:
   *
   *  - [Use `.env.local` to load environment variables](#loading-environment-variables)
   *  - [Expose environment variables to the browser by prefixing with `NEXT_PUBLIC_`](#exposing-environment-variables-to-the-browser)
   *
   * Refer to complete [Environment Variables documentation](https://nextjs.org/docs/api-reference/next.config.js/environment-variables)
   */
  env?: { [key: string]: string }
  /**
   * Detonation directory
   */
  distDir?: string
  /**
   * The build output directory (defaults to `.next`) is now cleared by default except for the Next.js caches.
   */
  cleanDistDir?: boolean
  /**
   * To set up a CDN, you can set up an asset prefix and configure your CDN's origin to resolve to the domain that Next.js is hosted on.
   *
   * See [CDN Support with Asset Prefix](https://nextjs.org/docs/api-reference/next.config.js/cdn-support-with-asset-prefix)
   */
  assetPrefix?: string
  /**
   * By default, `Next` will serve each file in the `pages` folder under a pathname matching the filename.
   * If your project uses a custom server, this behavior may result in the same content being served from multiple paths,
   * which can present problems with SEO and UX.
   *
   * To disable this behavior set this option to `false`.
   */
  useFileSystemPublicRoutes?: boolean

  /**
   * Next.js uses a constant id generated at build time to identify which version of your application is being served.
   * This can cause problems in multi-server deployments when `next build` is ran on every server.
   * In order to keep a static build id between builds you can provide your own build id.
   *
   * Use this option to provide your own build id.
   */
  generateBuildId?: () => string | null | Promise<string | null>

  generateEtags?: boolean
  pageExtensions?: string[]
  compress?: boolean
  poweredByHeader?: boolean
  images?: ImageConfig
  devIndicators?: {
    buildActivity?: boolean
    buildActivityPosition?:
      | 'bottom-right'
      | 'bottom-left'
      | 'top-right'
      | 'top-left'
  }
  onDemandEntries?: {
    maxInactiveAge?: number
    pagesBufferLength?: number
  }
  amp?: {
    canonicalBase?: string
  }
  basePath?: string
  sassOptions?: { [key: string]: any }
  productionBrowserSourceMaps?: boolean
  optimizeFonts?: boolean
  reactStrictMode?: boolean
  publicRuntimeConfig?: { [key: string]: any }
  serverRuntimeConfig?: { [key: string]: any }
  httpAgentOptions?: { keepAlive?: boolean }
  future?: {
    /**
     * @deprecated This option has been removed as webpack 5 is now default
     */
    webpack5?: false
  }
  outputFileTracing?: boolean
  staticPageGenerationTimeout?: number
  crossOrigin?: false | 'anonymous' | 'use-credentials'
  swcMinify?: boolean
  experimental?: {
    disablePostcssPresetEnv?: boolean
    removeConsole?:
      | boolean
      | {
          exclude?: string[]
        }
    reactRemoveProperties?:
      | boolean
      | {
          properties?: string[]
        }
    styledComponents?: boolean
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
    optimizeImages?: boolean
    optimizeCss?: boolean
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
    concurrentFeatures?: boolean
    serverComponents?: boolean
    fullySpecified?: boolean
    urlImports?: NonNullable<webpack5.Configuration['experiments']>['buildHttp']
    outputFileTracingRoot?: string
    outputStandalone?: boolean
    relay?: {
      src: string
      artifactDirectory?: string
      language?: 'typescript' | 'flow'
    }
  }
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
    optimizeImages: false,
    optimizeCss: false,
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
    concurrentFeatures: false,
    serverComponents: false,
    fullySpecified: false,
    outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
    outputStandalone: !!process.env.NEXT_PRIVATE_STANDALONE,
  },
}

export function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })

    if (typeof config.then === 'function') {
      throw new Error(
        '> Promise returned in next config. https://nextjs.org/docs/messages/promise-in-next-config'
      )
    }
  }
  return config
}
