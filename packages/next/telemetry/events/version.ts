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
  hasTypescript: boolean
}

type SessionStartedNextConfig = {
  target: string | null
  hasCustomWebpack: boolean
  hasCustomWebpackDev: boolean
  hasAssetPrefix: boolean
  hasCustomBuildId: boolean
  hasRuntimeConfig: boolean
  hasReactStrictMode: boolean
  hasRewrites: boolean
  hasRedirects: boolean
  hasMdxPages: boolean
}

type EventCliSessionStarted = SessionStartedVersions &
  SessionStarted &
  SessionStartedNextConfig

export function eventVersion(
  userConfig: { [key: string]: any },
  event: SessionStarted &
    Pick<SessionStartedNextConfig, 'hasRewrites' | 'hasRedirects'>
): { eventName: string; payload: EventCliSessionStarted }[] {
  // This should be an invariant, if it fails our build tooling is broken.
  if (typeof process.env.__NEXT_VERSION !== 'string') {
    return []
  }

  return [
    {
      eventName: EVENT_VERSION,
      payload: {
        ...event,
        nextVersion: process.env.__NEXT_VERSION,
        nodeVersion: process.version,
        target: userConfig?.target || null,
        hasCustomWebpack: typeof userConfig?.webpack === 'function',
        hasCustomWebpackDev:
          typeof userConfig?.webpackDevMiddleware === 'function',
        hasAssetPrefix: userConfig?.assetPrefix?.length > 0,
        hasCustomBuildId: typeof userConfig?.generateBuildId === 'function',
        hasRuntimeConfig:
          Object.keys(userConfig?.publicRuntimeConfig ?? {}).length > 0 ||
          Object.keys(userConfig?.serverRuntimeConfig ?? {}).length > 0,
        hasReactStrictMode: !!userConfig?.reactStrictMode,
        hasMdxPages:
          Array.isArray(userConfig?.pageExtensions) &&
          userConfig!.pageExtensions.includes('mdx'),
      },
    },
  ]
}
