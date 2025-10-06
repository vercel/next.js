/**
 * MCP tool for retrieving browser error state.
 *
 * This tool demonstrates server-to-browser communication in Next.js dev mode.
 * It leverages the existing HMR infrastructure rather than creating new channels.
 *
 * Flow:
 *   MCP client → server generates request ID → HMR message to browser →
 *   browser queries error overlay state → HMR response back → server performs source mapping →
 *   formatted output.
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

export function registerGetErrorsTool(
  server: McpServer,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  getActiveConnectionCount: () => number
) {
  server.registerTool(
    'get_errors',
    {
      description:
        'Get the current error state of the app when rendered in the browser, including any build or runtime errors with source-mapped stack traces',
      inputSchema: {},
    },
    async (_request) => {
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

        const errorsByUrl = new Map<string, OverlayState>()
        for (const response of responses) {
          if (response.data) {
            errorsByUrl.set(response.url, response.data)
          }
        }

        const hasErrors = Array.from(errorsByUrl.values()).some(
          (state) => state.errors.length > 0 || !!state.buildError
        )

        if (!hasErrors) {
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

        const output = await formatErrors(errorsByUrl)

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
