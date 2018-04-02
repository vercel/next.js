// @flow
import findUp from 'find-up'
import uuid from 'uuid'

const cache = new Map()

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => uuid.v4(),
  generateEtags: true,
  pageExtensions: ['jsx', 'js']
}

export default function getConfig (phase: string, dir: string, customConfig?: ?Object) {
  if (!cache.has(dir)) {
    cache.set(dir, loadConfig(phase, dir, customConfig))
  }
  return cache.get(dir)
}

export function loadConfig (phase: string, dir: string, customConfig?: ?Object) {
  if (customConfig && typeof customConfig === 'object') {
    customConfig.configOrigin = 'server'
    return withDefaults(customConfig)
  }
  const path: string = findUp.sync('next.config.js', {
    cwd: dir
  })

  let userConfig = {}

  if (path && path.length) {
    // $FlowFixMe
    const userConfigModule = require(path)
    userConfig = userConfigModule.default || userConfigModule
    if (typeof userConfigModule === 'function') {
      userConfig = userConfigModule(phase, {defaultConfig})
    }
    userConfig.configOrigin = 'next.config.js'
  }

  return withDefaults(userConfig)
}

function withDefaults (config: Object) {
  return Object.assign({}, defaultConfig, config)
}
