import type { VersionInfo } from './parse-version-info'
import type { DebugInfo } from '../../client/components/react-dev-overlay/types'

export type DevToolsServerState = {
  devIndicator: {
    isDisabled: boolean
    disabledUntil: number
  }
  versionInfo: VersionInfo
  debugInfo: DebugInfo
}

export const devToolsServerState: DevToolsServerState = {
  devIndicator: {
    isDisabled: false,
    disabledUntil: 0,
  },
  versionInfo: {
    installed: '0.0.0',
    staleness: 'unknown',
  },
  debugInfo: {
    devtoolsFrontendUrl: undefined,
  },
}
