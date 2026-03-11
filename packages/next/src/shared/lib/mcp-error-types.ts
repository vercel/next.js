import type { OverlayState } from '../../next-devtools/dev-overlay/shared'

export interface OverlayStateWithUrl {
  url: string
  errorState: OverlayState | null
}

export interface McpErrorStateResponse {
  event: string
  requestId: string
  errorState: OverlayState | null
  url: string
}
