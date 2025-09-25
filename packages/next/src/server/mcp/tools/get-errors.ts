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
import { nanoid } from 'next/dist/compiled/nanoid'
import type { OverlayStateWithUrl } from '../../../shared/lib/mcp-error-types'
import { formatErrors } from './utils/format-errors'

// These promises are created when the MCP endpoint is called but before the browser has responded
// with its error state. They are resolved when the browser has responded with its error state
// or when the timeout is reached.
const pendingRequests = new Map<
  string,
  {
    responses: OverlayStateWithUrl[]
    expectedCount: number
    resolve: (value: OverlayStateWithUrl[]) => void
    reject: (reason?: any) => void
    timeout: NodeJS.Timeout
  }
>()

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

        const requestId = `mcp-error-state-${nanoid()}`

        // The promise will be resolved when all active browser sessions have responded
        // with their respective error states. We will resolve the promise after 5 seconds
        // with whatever responses we have received so far.
        const responsePromise = new Promise<OverlayStateWithUrl[]>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              const pending = pendingRequests.get(requestId)
              if (pending && pending.responses.length > 0) {
                resolve(pending.responses)
              } else {
                reject(
                  new Error(
                    'Timeout waiting for error state from frontend. The browser may not be responding to HMR messages.'
                  )
                )
              }
              pendingRequests.delete(requestId)
            }, 5000)
            pendingRequests.set(requestId, {
              responses: [],
              expectedCount: connectionCount,
              resolve,
              reject,
              timeout,
            })
          }
        )

        // When browser receives this HMR message, it will send back a response with
        // its client-side error state, which will be handled by `handleErrorStateResponse`.
        sendHmrMessage({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE,
          requestId,
        })

        const clientStates = await responsePromise

        const errorsByUrl = new Map<string, OverlayState>()
        for (const state of clientStates) {
          if (state.errorState) {
            errorsByUrl.set(state.url, state.errorState)
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
                  clientStates.length === 0
                    ? 'No browser sessions responded.'
                    : `No errors detected in ${clientStates.length} browser session(s).`,
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
  if (!url) {
    throw new Error(
      'URL is required in MCP error state response. This is a bug in Next.js.'
    )
  }

  const pending = pendingRequests.get(requestId)
  if (pending) {
    pending.responses.push({ url, errorState })
    if (pending.responses.length >= pending.expectedCount) {
      clearTimeout(pending.timeout)
      pending.resolve(pending.responses)
      pendingRequests.delete(requestId)
    }
  }
}
