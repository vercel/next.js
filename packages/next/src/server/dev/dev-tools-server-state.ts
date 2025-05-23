import type { VersionInfo } from './parse-version-info'

export type DevToolsServerState = {
  devIndicator: { disabledUntil: number }
  versionInfo: VersionInfo
  debugInfo: {
    devtoolsFrontendUrl: string
  }
}

export const devToolsServerState: DevToolsServerState = {
  devIndicator: { disabledUntil: 0 },
  versionInfo: {
    installed: '0.0.0',
    staleness: 'unknown',
  },
  debugInfo: {
    devtoolsFrontendUrl: '',
  },
}
