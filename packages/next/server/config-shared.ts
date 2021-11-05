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

export type NextConfig = { [key: string]: any } & {
  i18n?: I18NConfig | null

  eslint?: ESLintConfig
  typescript?: TypeScriptConfig

  headers?: () => Promise<Header[]>
  rewrites?: () => Promise<
    | Rewrite[]
    | {
        beforeFiles: Rewrite[]
        afterFiles: Rewrite[]
        fallback: Rewrite[]
      }
  >
  redirects?: () => Promise<Redirect[]>

  webpack5?: false
  excludeDefaultMomentLocales?: boolean

  webpack?:
    | ((
        config: any,
        context: {
          dir: string
          dev: boolean
          isServer: boolean
          buildId: string
          config: NextConfigComplete
          defaultLoaders: { babel: any }
          totalPages: number
          webpack: any
        }
      ) => any)
    | null

  trailingSlash?: boolean
  env?: { [key: string]: string }
  distDir?: string
  cleanDistDir?: boolean
  assetPrefix?: string
  useFileSystemPublicRoutes?: boolean
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
     * @deprecated this options was moved to the top level
     */
    webpack5?: false
    strictPostcssConfiguration?: boolean
  }
  outputFileTracing?: boolean
  staticPageGenerationTimeout?: number
  crossOrigin?: false | 'anonymous' | 'use-credentials'
  swcMinify?: boolean
  experimental?: {
    swcMinify?: boolean
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
    craCompat: false,
    esmExternals: true,
    // default to 50MB limit
    isrMemoryCacheSize: 50 * 1024 * 1024,
    concurrentFeatures: false,
    serverComponents: false,
    fullySpecified: false,
    outputFileTracingRoot: process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT || '',
  },
  future: {
    strictPostcssConfiguration: false,
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
