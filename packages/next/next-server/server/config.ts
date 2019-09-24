import chalk from 'chalk'
import findUp from 'find-up'
import os from 'os'

import { CONFIG_FILE } from '../lib/constants'
import { execOnce } from '../lib/utils'

const targets = ['server', 'serverless', 'experimental-serverless-trace']

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
    ampBindInitData: false,
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1
    ),
    css: false,
    documentMiddleware: false,
    granularChunks: false,
    modern: false,
    profiling: false,
    publicDirectory: false,
    sprFlushToDisk: true,
  },
  future: {
    excludeDefaultMomentLocales: false,
  },
  serverRuntimeConfig: {},
  publicRuntimeConfig: {},
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
  Object.keys(userConfig).forEach((key: string) => {
    if (
      key === 'experimental' &&
      userConfig[key] &&
      userConfig[key] !== defaultConfig[key]
    ) {
      experimentalWarning()
    }

    const maybeObject = userConfig[key]
    if (!!maybeObject && maybeObject.constructor === Object) {
      userConfig[key] = {
        ...(defaultConfig[key] || {}),
        ...userConfig[key],
      }
    }
  })

  return { ...defaultConfig, ...userConfig }
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

export default function loadConfig(
  phase: string,
  dir: string,
  customConfig: any
) {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig })
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir,
  })

  // If config file was found
  if (path && path.length) {
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

    if (userConfig.amp && userConfig.amp.canonicalBase) {
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
      userConfig.publicRuntimeConfig &&
      Object.keys(userConfig.publicRuntimeConfig).length !== 0
    ) {
      // TODO: change error message tone to "Only compatible with [fat] server mode"
      throw new Error(
        'Cannot use publicRuntimeConfig with target=serverless https://err.sh/zeit/next.js/serverless-publicRuntimeConfig'
      )
    }

    return assignDefaults({ configOrigin: CONFIG_FILE, ...userConfig })
  }

  return defaultConfig
}

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}
