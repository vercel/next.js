import type { VersionInfo } from './parse-version-info'
import type { ResolvedMetadata } from '../../types'
import type { DebugInfo } from '../../client/components/react-dev-overlay/types'

export type DevToolsServerState = {
  devIndicator: {
    isDisabled: boolean
    disabledUntil: number
  }
  versionInfo: VersionInfo
  debugInfo: DebugInfo
  staticPathsInfo: {
    page: string
    pathname: string
    staticPaths: string[]
    isPageIncludedInStaticPaths: boolean
  }
  resolvedMetadata: ResolvedMetadata
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
  staticPathsInfo: {
    page: '',
    pathname: '',
    staticPaths: [],
    isPageIncludedInStaticPaths: false,
  },
  // ResolvedMetadata expects items to be null by default,
  // but is not strictly necessary for a default value so
  // used `as ResolvedMetadata`.
  resolvedMetadata: {} as ResolvedMetadata,
}
