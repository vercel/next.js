import type { OverlayState } from '../dev-overlay/shared'
import type { SegmentTrieData } from '../../shared/lib/mcp-page-metadata-types'

export const DEVTOOLS_WEBMCP_ENDPOINT = '/_next/devtools'

export type DevToolsInspectView =
  | 'status'
  | 'project'
  | 'page'
  | 'routes'
  | 'errors'
  | 'compilation'
  | 'logs'
  | 'server-action'
  | 'requests'

export type DevToolsInspectInput = {
  view: DevToolsInspectView
  routerType?: 'app' | 'pages'
  actionId?: string
  requestId?: string
}

export type DevToolsDocumentContext = {
  url?: string
  errorState?: Pick<OverlayState, 'errors' | 'buildError' | 'routerType'>
  pageMetadata?: SegmentTrieData
  htmlRequestId?: string
}

export type DevToolsCompileRouteInput = {
  path?: string
  routeSpecifier?: string
}

export type DevToolsWebMCPRequest =
  | {
      type: 'inspect'
      input: Omit<DevToolsInspectInput, 'view'> & {
        view: Exclude<DevToolsInspectView, 'status'>
      }
      context?: DevToolsDocumentContext
    }
  | { type: 'compile-route'; input: DevToolsCompileRouteInput }

export type DevToolsWebMCPResponse = { data: unknown } | { error: string }

export type DevToolsProjectMetadata = {
  projectPath: string
  devServerUrl: string | undefined
  bundler: 'turbopack' | 'webpack'
  capabilities: {
    compilation: boolean
    compileRoute: boolean
    requestInsights: boolean
  }
}
