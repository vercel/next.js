import chalk from 'next/dist/compiled/chalk'
import findUp from 'next/dist/compiled/find-up'
import os from 'os'
import { basename, extname } from 'path'

import { CONFIG_FILE } from '../lib/constants'
import { execOnce } from '../lib/utils'
import * as Log from '../../build/output/log'
import webpack from 'webpack'

const targets = ['server', 'serverless', 'experimental-serverless-trace']
const reactModes = ['legacy', 'blocking', 'concurrent']

type ExportPathMap = {
  [page: string]: { page: string; query?: { [key: string]: string } }
}

type Webpack = (
  config: webpack.Configuration,
  {
    dir,
    dev,
    isServer,
    buildId,
  }: { dir: string; dev: boolean; isServer: boolean; buildId: boolean }
) => webpack.Configuration | Promise<webpack.Configuration>
type WebpackDevMiddleware = (
  config: webpack.Configuration
) => webpack.Configuration

interface Config {
  env: { [key: string]: any }
  webpack: Webpack | null
  webpackDevMiddleware: WebpackDevMiddleware | null
  distDir: string
  assetPrefix: string
  configOrigin: string
  useFileSystemPublicRoutes: boolean
  generateBuildId: () => string | null | Promise<string>
  generateEtags: boolean
  pageExtensions: string[]
  target: 'server' | 'serverless'
  poweredByHeader: boolean
  compress: boolean
  devIndicators: {
    buildActivity: boolean
    autoPrerender: boolean
  }
  onDemandEntries: {
    maxInactiveAge: number
    pagesBufferLength: number
  }
  amp: {
    canonicalBase: string
  }
  exportTrailingSlash: boolean
  sassOptions: object
  experimental: { [key: string]: any }
  future: {
    excludeDefaultMomentLocales: boolean
  }
  serverRuntimeConfig: object
  publicRuntimeConfig: object
  reactStrictMode: boolean
  exportPathMap?: (defaultMap: ExportPathMap) => ExportPathMap
  typescript?: {
    ignoreBuildErrors: boolean
  }
}

const defaultConfig: Config = {
  env: [],
  webpack: null,
  webpackDevMiddleware: null,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  target: 'server',
  poweredByHeader: true,
  compress: true,
  devIndicators: {
    buildActivity: true,
    autoPrerender: true,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
  amp: {
    canonicalBase: '',
  },
  exportTrailingSlash: false,
  sassOptions: {},
  experimental: {
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    granularChunks: true,
    modern: false,
    plugins: false,
    profiling: false,
    sprFlushToDisk: true,
    reactMode: 'legacy',
    workerThreads: false,
    basePath: '',
    pageEnv: false,
    productionBrowserSourceMaps: false,
    optionalCatchAll: false,
  },
  future: {
    excludeDefaultMomentLocales: false,
  },
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactStrictMode: false,
}

const experimentalWarning = execOnce(() => {
  Log.warn(chalk.bold('You have enabled experimental feature(s).'))
  Log.warn(
    `Experimental features are not covered by semver, and may cause unexpected or broken application behavior. ` +
      `Use them at your own risk.`
  )
  console.warn()
})

function assignDefaults(userConfig: Config): Config {
  const config = Object.keys(userConfig).reduce<Config | object>(
    (config, key) => {
      const value = (userConfig as any)[key]

      if (value === undefined || value === null) {
        return config
      }

      if (key === 'experimental' && value && value !== defaultConfig[key]) {
        experimentalWarning()
      }

      if (key === 'distDir') {
        if (typeof value !== 'string') {
          throw new Error(
            `Specified distDir is not a string, found type "${typeof value}"`
          )
        }
        const userDistDir = value.trim()

        // don't allow public as the distDir as this is a reserved folder for
        // public files
        if (userDistDir === 'public') {
          throw new Error(
            `The 'public' directory is reserved in Next.js and can not be set as the 'distDir'. https://err.sh/vercel/next.js/can-not-output-to-public`
          )
        }
        // make sure distDir isn't an empty string as it can result in the provided
        // directory being deleted in development mode
        if (userDistDir.length === 0) {
          throw new Error(
            `Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined`
          )
        }
      }

      if (key === 'pageExtensions') {
        if (!Array.isArray(value)) {
          throw new Error(
            `Specified pageExtensions is not an array of strings, found "${value}". Please update this config or remove it.`
          )
        }

        if (!value.length) {
          throw new Error(
            `Specified pageExtensions is an empty array. Please update it with the relevant extensions or remove it.`
          )
        }

        value.forEach((ext) => {
          if (typeof ext !== 'string') {
            throw new Error(
              `Specified pageExtensions is not an array of strings, found "${ext}" of type "${typeof ext}". Please update this config or remove it.`
            )
          }
        })
      }

      if (!!value && value.constructor === Object) {
        ;(config as any)[key] = {
          ...(defaultConfig as any)[key],
          ...Object.keys(value).reduce<any>((c, k) => {
            const v = value[k]
            if (v !== undefined && v !== null) {
              c[k] = v
            }
            return c
          }, {}),
        }
      } else {
        ;(config as any)[key] = value
      }

      return config
    },
    {}
  )

  const result = { ...defaultConfig, ...config }

  if (typeof result.assetPrefix !== 'string') {
    throw new Error(
      `Specified assetPrefix is not a string, found type "${typeof result.assetPrefix}" https://err.sh/vercel/next.js/invalid-assetprefix`
    )
  }
  if (result.experimental) {
    if (typeof result.experimental.basePath !== 'string') {
      throw new Error(
        `Specified basePath is not a string, found type "${typeof result
          .experimental.basePath}"`
      )
    }

    if (result.experimental.basePath !== '') {
      if (result.experimental.basePath === '/') {
        throw new Error(
          `Specified basePath /. basePath has to be either an empty string or a path prefix"`
        )
      }

      if (!result.experimental.basePath.startsWith('/')) {
        throw new Error(
          `Specified basePath has to start with a /, found "${result.experimental.basePath}"`
        )
      }

      if (result.experimental.basePath !== '/') {
        if (result.experimental.basePath.endsWith('/')) {
          throw new Error(
            `Specified basePath should not end with /, found "${result.experimental.basePath}"`
          )
        }

        if (result.assetPrefix === '') {
          result.assetPrefix = result.experimental.basePath
        }
      }
    }
  }
  return result
}

export function normalizeConfig(phase: string, config: Config | any): Config {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })

    if (typeof config.then === 'function') {
      throw new Error(
        '> Promise returned in next config. https://err.sh/vercel/next.js/promise-in-next-config'
      )
    }
  }
  return config
}

export default function loadConfig(
  phase: string,
  dir: string,
  customConfig?: Config | null
): Config {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig })
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir,
  })

  // If config file was found
  if (path?.length) {
    const userConfigModule = require(path)
    const userConfig = normalizeConfig(
      phase,
      userConfigModule.default || userConfigModule
    )

    if (Object.keys(userConfig).length === 0) {
      console.warn(
        chalk.yellow.bold('Warning: ') +
          'Detected next.config.js, no exported configuration found. https://err.sh/vercel/next.js/empty-configuration'
      )
    }

    if (userConfig.target && !targets.includes(userConfig.target)) {
      throw new Error(
        `Specified target is invalid. Provided: "${
          userConfig.target
        }" should be one of ${targets.join(', ')}`
      )
    }

    if (userConfig.amp?.canonicalBase) {
      const { canonicalBase } = userConfig.amp || ({} as any)
      userConfig.amp = userConfig.amp || {}
      userConfig.amp.canonicalBase =
        (canonicalBase.endsWith('/')
          ? canonicalBase.slice(0, -1)
          : canonicalBase) || ''
    }

    if (
      userConfig.experimental?.reactMode &&
      !reactModes.includes(userConfig.experimental.reactMode)
    ) {
      throw new Error(
        `Specified React Mode is invalid. Provided: ${
          userConfig.experimental.reactMode
        } should be one of ${reactModes.join(', ')}`
      )
    }

    return assignDefaults({ configOrigin: CONFIG_FILE, ...userConfig })
  } else {
    const configBaseName = basename(CONFIG_FILE, extname(CONFIG_FILE))
    const nonJsPath = findUp.sync(
      [
        `${configBaseName}.jsx`,
        `${configBaseName}.ts`,
        `${configBaseName}.tsx`,
        `${configBaseName}.json`,
      ],
      { cwd: dir }
    )
    if (nonJsPath?.length) {
      throw new Error(
        `Configuring Next.js via '${basename(
          nonJsPath
        )}' is not supported. Please replace the file with 'next.config.js'.`
      )
    }
  }

  return defaultConfig
}

export function isTargetLikeServerless(target: string): boolean {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}
