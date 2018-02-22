import findUp from 'find-up'

const cache = new Map()

export const phases = {
  PRODUCTION_BUILD: 'production-build',
  PRODUCTION_SERVER: 'production-server',
  DEVELOPMENT_SERVER: 'development-server',
  EXPORT: 'export'
}

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  pageExtensions: ['jsx', 'js'] // jsx before js because otherwise regex matching will match js first
}

export default function getConfig (phase, dir, customConfig) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(phase, dir, customConfig))
  }
  return cache.get(dir)
}

function loadConfig (phase, dir, customConfig) {
  if (customConfig && typeof customConfig === 'object') {
    customConfig.configOrigin = 'server'
    return withDefaults(customConfig)
  }
  const path = findUp.sync('next.config.js', {
    cwd: dir
  })

  let userConfig = {}

  if (path && path.length) {
    const userConfigModule = require(path)
    userConfig = userConfigModule.default || userConfigModule
    if (typeof userConfigModule === 'function') {
      userConfig = userConfigModule(phase, {defaultConfig, phases})
    }
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config) {
  return Object.assign({}, defaultConfig, config)
}
