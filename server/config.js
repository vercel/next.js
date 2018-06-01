// @flow
import findUp from 'find-up'
import uuid from 'uuid'

type WebpackConfig = *

type WebpackDevMiddlewareConfig = *

export type NextConfig = {
  webpack: null | (webpackConfig: WebpackConfig, {dir: string, dev: boolean, isServer: boolean, buildId: string, config: NextConfig, defaultLoaders: {}, totalPages: number}) => WebpackConfig,
  webpackDevMiddleware: null | (WebpackDevMiddlewareConfig: WebpackDevMiddlewareConfig) => WebpackDevMiddlewareConfig,
  poweredByHeader: boolean,
  distDir: string,
  assetPrefix: string,
  configOrigin: string,
  useFileSystemPublicRoutes: boolean,
  generateBuildId: () => string,
  generateEtags: boolean,
  pageExtensions: Array<string>
}

const defaultConfig: NextConfig = {
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

export default function getConfig (phase: string, dir: string, customConfig?: NextConfig): NextConfig {
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

function withDefaults (config: {} | NextConfig) {
  return Object.assign({}, defaultConfig, config)
}
