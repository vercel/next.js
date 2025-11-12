/**
 * MCP tool for retrieving error state from Next.js dev server.
 *
 * This tool provides comprehensive error reporting including:
 * - Next.js global errors (e.g., next.config validation errors)
 * - Browser runtime errors with source-mapped stack traces
 * - Build errors from webpack/turbopack compilation
 *
 * For browser errors, it leverages the HMR infrastructure for server-to-browser communication.
 *
 * Flow:
 *   MCP client → server generates request ID → HMR message to browser →
 *   browser queries error overlay state → HMR response back → server performs source mapping →
 *   combined with global errors → formatted output.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { OverlayState } from '../../../next-devtools/dev-overlay/shared'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from '../../dev/hot-reloader-types'
import { formatErrors } from './utils/format-errors'
import {
  createBrowserRequest,
  handleBrowserPageResponse,
  DEFAULT_BROWSER_REQUEST_TIMEOUT_MS,
} from './utils/browser-communication'
import { NextInstanceErrorState } from './next-instance-error-state'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetErrorsTool(
  server: McpServer,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  getActiveConnectionCount: () => number
) {
  server.registerTool(
    'get_errors',
    {
      description:
        'Get the current error state from the Next.js dev server, including Next.js global errors (e.g., next.config validation), browser runtime errors, and build errors with source-mapped stack traces',
      inputSchema: {},
    },
    async (_request) => {
      // Track telemetry
      mcpTelemetryTracker.recordToolCall('mcp/get_errors')

      try {
        const connectionCount = getActiveConnectionCount()
        if (connectionCount === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No browser sessions connected. Please open your application in a browser to retrieve error state.',
              },
            ],
          }
        }

        const responses = await createBrowserRequest<OverlayState>(
          HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE,
          sendHmrMessage,
          getActiveConnectionCount,
          DEFAULT_BROWSER_REQUEST_TIMEOUT_MS
        )

        // The error state for each route
        // key is the route path, value is the error state
        const routesErrorState = new Map<string, OverlayState>()
        for (const response of responses) {
          if (response.data) {
            routesErrorState.set(response.url, response.data)
          }
        }

        const hasRouteErrors = Array.from(routesErrorState.values()).some(
          (state) => state.errors.length > 0 || !!state.buildError
        )
        const hasInstanceErrors = NextInstanceErrorState.nextConfig.length > 0

        if (!hasRouteErrors && !hasInstanceErrors) {
          return {
            content: [
              {
                type: 'text',
                text:
                  responses.length === 0
                    ? 'No browser sessions responded.'
                    : `No errors detected in ${responses.length} browser session(s).`,
              },
            ],
          }
        }

        const output = await formatErrors(
          routesErrorState,
          NextInstanceErrorState
        )

        return {
          content: [
            {
              type: 'text',
              text: output,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}

// Browser will first receive an HMR message from server to send back its error state.
// The actual state is sent back in a subsequent HMR message, which is handled by this function
// on the server.
export function handleErrorStateResponse(
  requestId: string,
  errorState: OverlayState | null,
  url: string | undefined
) {
  handleBrowserPageResponse<OverlayState | null>(
    requestId,
    errorState,
    url || ''
  )
}
