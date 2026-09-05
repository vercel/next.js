import type { SerializedOverlayState } from '../../next-devtools/dev-overlay.browser'

export interface OverlayStateWithUrl {
  url: string
  errorState: SerializedOverlayState | null
}

export interface McpErrorStateResponse {
  event: string
  requestId: string
  errorState: SerializedOverlayState | null
  url: string
}
