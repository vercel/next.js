import { join } from 'path'
import { existsSync } from 'fs'

const cache = new Map()

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  pagesGlobPattern: 'pages/**/*.js'
}

export default function getConfig (dir, customConfig) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(dir, customConfig))
  }
  return cache.get(dir)
}

function loadConfig (dir, customConfig) {
  if (customConfig && typeof customConfig === 'object') {
    customConfig.configOrigin = 'server'
    return withDefaults(customConfig)
  }
  const path = join(dir, 'next.config.js')

  let userConfig = {}

  const userHasConfig = existsSync(path)
  if (userHasConfig) {
    const userConfigModule = require(path)
    userConfig = userConfigModule.default || userConfigModule
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config) {
  return Object.assign({}, defaultConfig, config)
}
