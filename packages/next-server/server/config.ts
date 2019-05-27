import os from 'os'
import findUp from 'find-up'
import { CONFIG_FILE } from '../lib/constants'

const targets = ['server', 'serverless']

const defaultConfig: {[key: string]: any} = {
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
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2,
  },
  experimental: {
    cpus: Math.max(
      1,
      (Number(process.env.CIRCLE_NODE_TOTAL) ||
        (os.cpus() || { length: 1 }).length) - 1,
    ),
    dynamicRouting: false,
    autoExport: false,
    ampBindInitData: false,
    exportTrailingSlash: true,
    terserLoader: false,
    profiling: false,
    flyingShuttle: false,
    asyncToPromises: false,
  },
}

function assignDefaults(userConfig: {[key: string]: any}) {
  Object.keys(userConfig).forEach((key: string) => {
    const maybeObject = userConfig[key]
    if ((!!maybeObject) && (maybeObject.constructor === Object)) {
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
        '> Promise returned in next config. https://err.sh/zeit/next.js/promise-in-next-config.md',
      )
    }
  }
  return config
}

export default function loadConfig(phase: string, dir: string, customConfig: any) {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig })
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir,
  })

  // If config file was found
  if (path && path.length) {
    const userConfigModule = require(path)
    const userConfig = normalizeConfig(phase, userConfigModule.default || userConfigModule)
    if (userConfig.target && !targets.includes(userConfig.target)) {
      throw new Error(`Specified target is invalid. Provided: "${userConfig.target}" should be one of ${targets.join(', ')}`)
    }
    return assignDefaults({ configOrigin: CONFIG_FILE, ...userConfig })
  }

  return defaultConfig
}
