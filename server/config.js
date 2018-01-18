import findUp from 'find-up'

const cache = new Map()

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true
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
  const path = findUp.sync('next.config.js', {
    cwd: dir
  })

  let userConfig = {}

  if (path && path.length) {
    const userConfigModule = require(path)
    userConfig = userConfigModule.default || userConfigModule
    if (userConfig.poweredByHeader === true || userConfig.poweredByHeader === false) {
      console.warn('> the `poweredByHeader` option has been removed https://err.sh/zeit/next.js/powered-by-header-option-removed')
    }
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config) {
  return Object.assign({}, defaultConfig, config)
}
