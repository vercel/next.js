// @flow
import findUp from 'find-up'
import {CONFIG_FILE} from 'next-server/constants'

type WebpackConfig = *

type WebpackDevMiddlewareConfig = *

export type NextConfig = {|
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
|}

const defaultConfig: NextConfig = {
  webpack: null,
  webpackDevMiddleware: null,
  poweredByHeader: true,
  distDir: '.next',
  assetPrefix: '',
  configOrigin: 'default',
  useFileSystemPublicRoutes: true,
  generateBuildId: () => {
    // nanoid is a small url-safe uuid generator
    const nanoid = require('nanoid')
    return nanoid()
  },
  generateEtags: true,
  pageExtensions: ['jsx', 'js']
}

type PhaseFunction = (phase: string, options: {defaultConfig: NextConfig}) => NextConfig

export default function loadConfig (phase: string, dir: string, customConfig?: NextConfig): NextConfig {
  if (customConfig) {
    customConfig.configOrigin = 'server'
    return {...defaultConfig, ...customConfig}
  }
  const path: string = findUp.sync(CONFIG_FILE, {
    cwd: dir
  })

  // If config file was found
  if (path && path.length) {
    // $FlowFixMe
    const userConfigModule = require(path)
    const userConfigInitial: NextConfig | PhaseFunction = userConfigModule.default || userConfigModule
    if (typeof userConfigInitial === 'function') {
      return {...defaultConfig, configOrigin: CONFIG_FILE, ...userConfigInitial(phase, {defaultConfig})}
    }

    return {...defaultConfig, configOrigin: CONFIG_FILE, ...userConfigInitial}
  }

  return defaultConfig
}
