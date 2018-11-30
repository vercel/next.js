import findUp from 'find-up'
import {CONFIG_FILE} from 'next-server/constants'

const defaultConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => null,
  generateEtags: true,
  pageExtensions: ['jsx', 'js']
}

export default function loadConfig (phase, dir, customConfig) {
  if (customConfig) {
    customConfig.configOrigin = 'server'
    return {...defaultConfig, ...customConfig}
  }
  const path = findUp.sync(CONFIG_FILE, {
    cwd: dir
  })

  // If config file was found
  if (path && path.length) {
    const userConfigModule = require(path)
    const userConfigInitial = userConfigModule.default || userConfigModule
    if (typeof userConfigInitial === 'function') {
      return {...defaultConfig, configOrigin: CONFIG_FILE, ...userConfigInitial(phase, {defaultConfig})}
    }

    return {...defaultConfig, configOrigin: CONFIG_FILE, ...userConfigInitial}
  }

  return defaultConfig
}
