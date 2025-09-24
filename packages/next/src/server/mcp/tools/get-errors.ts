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
 *
 * The browser can access both build errors and runtime errors, including raw stack traces.
 * Source mapping is performed on the server to convert bundled stack traces back to their original
 * source locations before formatting them for human consumption.
 */
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { OverlayState } from '../../../next-devtools/dev-overlay/shared'
import type { SupportedErrorEvent } from '../../../next-devtools/dev-overlay/container/runtime-error/render-error'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from '../../dev/hot-reloader-types'
import { getErrorSource } from '../../../shared/lib/error-source'
import { nanoid } from 'next/dist/compiled/nanoid'
import type {
  OriginalStackFramesRequest,
  OriginalStackFramesResponse,
} from '../../../next-devtools/server/shared'

const pendingRequests = new Map<
  string,
  {
    resolve: (value: OverlayState | null) => void
    reject: (reason?: any) => void
    timeout: NodeJS.Timeout
  }
>()

export function handleErrorStateResponse(
  requestId: string,
  errorState: OverlayState | null
) {
  const pending = pendingRequests.get(requestId)
  if (pending) {
    clearTimeout(pending.timeout)
    pending.resolve(errorState)
    pendingRequests.delete(requestId)
  }
}

export function registerGetErrorsTool(
  server: McpServer,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  hasActiveHmrConnections: () => boolean
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
        if (!hasActiveHmrConnections()) {
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
        const responsePromise = new Promise<OverlayState | null>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              pendingRequests.delete(requestId)
              reject(
                new Error(
                  'Timeout waiting for error state from frontend. The browser may not be responding to HMR messages.'
                )
              )
            }, 5000)
            pendingRequests.set(requestId, { resolve, reject, timeout })
          }
        )

        sendHmrMessage({
          type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_CURRENT_ERROR_STATE,
          requestId,
        })

        const overlayState = await responsePromise

        if (!overlayState) {
          return {
            content: [
              {
                type: 'text',
                text: 'No errors detected in the browser.',
              },
            ],
          }
        }

        const totalErrorCount =
          overlayState.errors.length + (overlayState.buildError ? 1 : 0)

        if (totalErrorCount === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No errors detected in the browser.',
              },
            ],
          }
        }

        let output = `Found ${totalErrorCount} error(s) in the browser:\n\n`

        // Build errors
        if (overlayState.buildError) {
          output += '=== BUILD ERROR ===\n'
          output += overlayState.buildError
          output += '\n\n'
        }

        // Runtime errors with source-mapped stack traces
        if (overlayState.errors.length > 0) {
          output += await formatRuntimeError(
            overlayState.errors,
            overlayState.routerType === 'app'
          )
        }

        return {
          content: [
            {
              type: 'text',
              text: output.trim(),
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

// Stack frame formatting utilities
type StackFrameForFormatting = {
  file: string | null
  methodName: string
  line1: number | null
  column1: number | null
}

const formatStackFrame = (frame: StackFrameForFormatting): string => {
  const file = frame.file || '<unknown>'
  const method = frame.methodName || '<anonymous>'
  const { line1: line, column1: column } = frame
  return line && column
    ? `  at ${method} (${file}:${line}:${column})`
    : line
      ? `  at ${method} (${file}:${line})`
      : `  at ${method} (${file})`
}

const formatErrorFrames = async (
  frames: readonly StackFrameForFormatting[],
  context: { isServer: boolean; isEdgeServer: boolean; isAppDirectory: boolean }
): Promise<string> => {
  try {
    const resolvedFrames = await resolveStackFrames({
      frames: frames.map((frame) => ({
        file: frame.file || null,
        methodName: frame.methodName || '<anonymous>',
        arguments: [],
        line1: frame.line1 || null,
        column1: frame.column1 || null,
      })),
      isServer: context.isServer,
      isEdgeServer: context.isEdgeServer,
      isAppDirectory: context.isAppDirectory,
    })

    return (
      resolvedFrames
        .filter(
          (resolvedFrame) =>
            // Keep frames that are not ignored
            !(
              resolvedFrame.status === 'fulfilled' &&
              resolvedFrame.value.originalStackFrame?.ignored
            )
        )
        .map((resolvedFrame, j) =>
          resolvedFrame.status === 'fulfilled' &&
          resolvedFrame.value.originalStackFrame
            ? formatStackFrame(resolvedFrame.value.originalStackFrame)
            : formatStackFrame(frames[j])
        )
        .join('\n') + '\n'
    )
  } catch {
    return frames.map(formatStackFrame).join('\n') + '\n'
  }
}

async function formatRuntimeError(
  errors: readonly SupportedErrorEvent[],
  isAppDirectory: boolean
): Promise<string> {
  const formatError = async (
    error: SupportedErrorEvent,
    index: number
  ): Promise<string> => {
    const errorHeader = `\n[Error ${index + 1}] (Type: ${error.type})\n`
    const errorMessage = `${error.error?.name || 'Error'}: ${error.error?.message || 'Unknown error'}\n`

    if (!error.frames?.length) {
      return errorHeader + errorMessage + (error.error?.stack || '')
    }

    const errorSource = getErrorSource(error.error)
    const frames = await formatErrorFrames(error.frames, {
      isServer: errorSource === 'server',
      isEdgeServer: errorSource === 'edge-server',
      isAppDirectory,
    })

    return errorHeader + errorMessage + frames
  }

  const formattedErrors = await Promise.all(errors.map(formatError))
  return '=== RUNTIME ERRORS ===\n' + formattedErrors.join('\n---\n')
}

// Dependency injection for stack frame resolver
type StackFrameResolver = (
  request: OriginalStackFramesRequest
) => Promise<OriginalStackFramesResponse>

let stackFrameResolver: StackFrameResolver | undefined

export function setStackFrameResolver(fn: StackFrameResolver) {
  stackFrameResolver = fn
}

async function resolveStackFrames(
  request: OriginalStackFramesRequest
): Promise<OriginalStackFramesResponse> {
  if (!stackFrameResolver) {
    throw new Error(
      'Stack frame resolver not initialized. This is a bug in Next.js.'
    )
  }
  return stackFrameResolver(request)
}
