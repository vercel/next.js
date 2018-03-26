import findUp from 'find-up'

const cache = new Map()

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateEtags: true,
  pageExtensions: ['jsx', 'js'] // jsx before js because otherwise regex matching will match js first
}

export default function getConfig (phase, dir, customConfig) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(phase, dir, customConfig))
  }
  return cache.get(dir)
}

export function loadConfig (phase, dir, customConfig) {
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
      userConfig = userConfigModule(phase, {defaultConfig})
    }
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config) {
  return Object.assign({}, defaultConfig, config)
}
