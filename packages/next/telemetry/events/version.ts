import { pageExtensions } from '../../next-server/server/config'

const EVENT_VERSION = 'NEXT_CLI_SESSION_STARTED'

type SessionStartedVersions = {
  nextVersion: string
  nodeVersion: string
}

type SessionStarted = {
  cliCommand: string
  isSrcDir: boolean | null
  hasNowJson: boolean
  isCustomServer: boolean | null
  hasTypeScript: boolean
}

type SessionStartedNextConfig = {
  target: string
  hasCustomWebpack: boolean
  hasCustomWebpackDev: boolean
  hasAssetPrefix: boolean
  hasCustomBuildId: boolean
  hasDistDir: boolean
  hasRuntimeConfig: boolean
  hasReactStrictMode: boolean
  hasRewrites: boolean
  hasRedirects: boolean
  hasTrailingSlash: boolean
  hasExportPathMap: boolean
  pageExtensions: string
}

type EventCliSessionStarted = SessionStartedVersions &
  SessionStarted &
  SessionStartedNextConfig

export function eventVersion(
  userConfig: { [key: string]: any } = {},
  event: SessionStarted &
    Pick<SessionStartedNextConfig, 'hasRewrites' | 'hasRedirects'>
): { eventName: string; payload: EventCliSessionStarted }[] {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return []
  }

  const customExtensions = Array.isArray(userConfig.pageExtensions)
    ? userConfig.pageExtensions.filter(
        (ext, i) =>
          typeof ext === 'string' &&
          ext.length > 0 &&
          ext.length <= 10 &&
          !pageExtensions.includes(ext) &&
          // Remove duplicates
          userConfig.pageExtensions.indexOf(ext, i + 1) === -1
      )
    : []

  return [
    {
      eventName: EVENT_VERSION,
      payload: {
        ...event,
        nextVersion: process.env.__NEXT_VERSION,
        nodeVersion: process.version,
        target: userConfig.target || 'default:server',
        hasCustomWebpack: typeof userConfig.webpack === 'function',
        hasCustomWebpackDev:
          typeof userConfig.webpackDevMiddleware === 'function',
        hasAssetPrefix: userConfig.assetPrefix?.length > 0,
        hasCustomBuildId: typeof userConfig.generateBuildId === 'function',
        hasDistDir: userConfig.distDir ? userConfig.distDir !== '.next' : false,
        hasRuntimeConfig:
          Object.keys(userConfig.publicRuntimeConfig ?? {}).length > 0 ||
          Object.keys(userConfig.serverRuntimeConfig ?? {}).length > 0,
        hasReactStrictMode: !!userConfig.reactStrictMode,
        hasTrailingSlash: !!userConfig.exportTrailingSlash,
        hasExportPathMap: typeof userConfig.exportPathMap === 'function',
        pageExtensions: customExtensions.length
          ? customExtensions.join(', ')
          : 'default',
      },
    },
  ]
}
