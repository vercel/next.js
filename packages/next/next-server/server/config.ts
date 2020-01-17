import chalk from 'chalk'
import findUp from 'find-up'
import os from 'os'
import { basename, extname } from 'path'

import { CONFIG_FILE } from '../lib/constants'
import { execOnce } from '../lib/utils'

const targets = ['server', 'serverless', 'experimental-serverless-trace']
const reactModes = ['legacy', 'blocking', 'concurrent']

const defaultConfig: { [key: string]: any } = {
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
  experimental: {
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    css: true,
    documentMiddleware: false,
    granularChunks: true,
    modern: false,
    plugins: false,
    profiling: false,
    sprFlushToDisk: true,
    reactMode: 'legacy',
    workerThreads: false,
    basePath: '',
  },
  future: {
    excludeDefaultMomentLocales: false,
  },
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
  reactStrictMode: false,
}

const experimentalWarning = execOnce(() => {
  console.warn(
    chalk.yellow.bold('Warning: ') +
      chalk.bold('You have enabled experimental feature(s).')
  )
  console.warn(
    `Experimental features are not covered by semver, and may cause unexpected or broken application behavior. ` +
      `Use them at your own risk.`
  )
  console.warn()
})

function assignDefaults(userConfig: { [key: string]: any }) {
  const config = { ...userConfig }

  Object.keys(config).forEach((key: string) => {
    if (
      key === 'experimental' &&
      config[key] &&
      config[key] !== defaultConfig[key]
    ) {
      experimentalWarning()
    }

    if (key === 'distDir' && config[key] === 'public') {
      throw new Error(
        `The 'public' directory is reserved in Next.js and can not be set as the 'distDir'. https://err.sh/zeit/next.js/can-not-output-to-public`
      )
    }

    const maybeObject = config[key]
    if (!!maybeObject && maybeObject.constructor === Object) {
      config[key] = {
        ...(defaultConfig[key] || {}),
        ...config[key],
      }
    }
  })

  const result = { ...defaultConfig, ...config }

  if (typeof result.assetPrefix !== 'string') {
    throw new Error(
      `Specified assetPrefix is not a string, found type "${typeof result.assetPrefix}" https://err.sh/zeit/next.js/invalid-assetprefix`
    )
  }
  if (result.experimental) {
    if (result.experimental.css) {
      // The new CSS support requires granular chunks be enabled.
      if (result.experimental.granularChunks !== true) {
        throw new Error(
          `The new CSS support requires granular chunks be enabled.`
        )
      }
    }

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

function normalizeConfig(phase: string, config: any) {
  if (typeof config === 'function') {
    config = config(phase, { defaultConfig })

    if (typeof config.then === 'function') {
      throw new Error(
        '> Promise returned in next config. https://err.sh/zeit/next.js/promise-in-next-config'
      )
    }
  }
  return config
}

function loadUserConfig(
  phase: string,
  dir: string,
  customConfig?: object | null
): { [key: string]: any } | undefined {
  if (customConfig) {
    return { configOrigin: 'server', ...customConfig }
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir,
  })

  if (!path?.length) {
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
    return
  }

  const userConfigModule = require(path)
  const userConfig = normalizeConfig(
    phase,
    userConfigModule.default || userConfigModule
  )
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
    userConfig.target &&
    userConfig.target !== 'server' &&
    ((userConfig.publicRuntimeConfig &&
      Object.keys(userConfig.publicRuntimeConfig).length !== 0) ||
      (userConfig.serverRuntimeConfig &&
        Object.keys(userConfig.serverRuntimeConfig).length !== 0))
  ) {
    // TODO: change error message tone to "Only compatible with [fat] server mode"
    throw new Error(
      'Cannot use publicRuntimeConfig or serverRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
    )
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

  return { configOrigin: CONFIG_FILE, ...userConfig }
}

export default function loadConfig(
  phase: string,
  dir: string,
  customConfig?: object | null
) {
  const userConfig = loadUserConfig(phase, dir, customConfig)
  return {
    userConfig,
    config: userConfig ? assignDefaults(userConfig) : defaultConfig,
  }
}

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}
