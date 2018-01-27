import findUp from 'find-up'

const cache = new Map()

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  webpackModuleShouldBeCommonInProduction: function ({totalPages, count}) {
    // If there are one or two pages, only move modules to common if they are
    // used in all of the pages. Otherwise, move modules used in at-least
    // 1/2 of the total pages into commons.
    if (totalPages <= 2) {
      return count >= totalPages
    }
    return count >= totalPages * 0.5
  },
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  pagesGlobPattern: 'pages/**/*.+(js|jsx)'
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
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config) {
  return Object.assign({}, defaultConfig, config)
}
