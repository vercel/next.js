import findUp from 'find-up'
import { CONFIG_FILE } from 'next-server/constants'

const targets = ['server', 'serverless']

const defaultConfig = {
  env: [],
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['jsx', 'js'],
  target: 'server',
  onDemandEntries: {
    maxInactiveAge: 60 * 1000,
    pagesBufferLength: 2
  },
  experimental: {
    amp: false
  }
}

function assignDefaults (userConfig) {
  Object.keys(userConfig).forEach(key => {
    const maybeObject = userConfig[key]
    if ((!!maybeObject) && (maybeObject.constructor === Object)) {
      userConfig[key] = {
        ...(defaultConfig[key] || {}),
        ...userConfig[key]
      }
    }
  })

  return { ...defaultConfig, ...userConfig }
}

function normalizeConfig (phase, config) {
  if (typeof config === 'function') {
    return config(phase, { defaultConfig })
  }

  return config
}

export default function loadConfig (phase, dir, customConfig) {
  if (customConfig) {
    return assignDefaults({ configOrigin: 'server', ...customConfig })
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir
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
