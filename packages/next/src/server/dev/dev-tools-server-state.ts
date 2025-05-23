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

declare global {
  var devToolsServerState: DevToolsServerState
}
