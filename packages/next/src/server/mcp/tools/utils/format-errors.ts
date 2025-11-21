import type { OverlayState } from '../../../../next-devtools/dev-overlay/shared'
import type { SupportedErrorEvent } from '../../../../next-devtools/dev-overlay/container/runtime-error/render-error'
import { getErrorSource } from '../../../../shared/lib/error-source'
import type {
  OriginalStackFramesRequest,
  OriginalStackFramesResponse,
} from '../../../../next-devtools/server/shared'

type StackFrameForFormatting = {
  file: string | null
  methodName: string
  line1: number | null
  column1: number | null
}

type StackFrameResolver = (
  request: OriginalStackFramesRequest
) => Promise<OriginalStackFramesResponse>

// Dependency injection for stack frame resolver
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
  context: {
    isServer: boolean
    isEdgeServer: boolean
    isAppDirectory: boolean
  }
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
    const errorHeader = `\n#### Error ${index + 1} (Type: ${error.type})\n\n`
    const errorName = error.error?.name || 'Error'
    const errorMsg = error.error?.message || 'Unknown error'
    const errorMessage = `**${errorName}**: ${errorMsg}\n\n`

    if (!error.frames?.length) {
      const stack = error.error?.stack || ''
      return (
        errorHeader + errorMessage + (stack ? `\`\`\`\n${stack}\n\`\`\`\n` : '')
      )
    }

    const errorSource = getErrorSource(error.error)
    const frames = await formatErrorFrames(error.frames, {
      isServer: errorSource === 'server',
      isEdgeServer: errorSource === 'edge-server',
      isAppDirectory,
    })

    return errorHeader + errorMessage + `\`\`\`\n${frames}\`\`\`\n`
  }

  const formattedErrors = await Promise.all(errors.map(formatError))
  return '### Runtime Errors\n' + formattedErrors.join('\n---\n')
}

export async function formatErrors(
  errorsByUrl: Map<string, OverlayState>,
  nextInstanceErrors: { nextConfig: unknown[] } = { nextConfig: [] }
): Promise<string> {
  let output = ''

  // Format Next.js instance errors first (e.g., next.config.js errors)
  if (nextInstanceErrors.nextConfig.length > 0) {
    output += `# Next.js Configuration Errors\n\n`
    output += `**${nextInstanceErrors.nextConfig.length} error(s) found in next.config**\n\n`

    nextInstanceErrors.nextConfig.forEach((error, index) => {
      output += `## Error ${index + 1}\n\n`
      output += '```\n'
      if (error instanceof Error) {
        output += `${error.name}: ${error.message}\n`
        if (error.stack) {
          output += error.stack
        }
      } else {
        output += String(error)
      }
      output += '\n```\n\n'
    })

    output += '---\n\n'
  }

  // Format browser session errors
  if (errorsByUrl.size > 0) {
    output += `# Found errors in ${errorsByUrl.size} browser session(s)\n\n`

    for (const [url, overlayState] of errorsByUrl) {
      const totalErrorCount =
        overlayState.errors.length + (overlayState.buildError ? 1 : 0)

      if (totalErrorCount === 0) continue

      let displayUrl = url
      try {
        const urlObj = new URL(url)
        displayUrl = urlObj.pathname + urlObj.search + urlObj.hash
      } catch {
        // If URL parsing fails, use the original URL
      }

      output += `## Session: ${displayUrl}\n\n`
      output += `**${totalErrorCount} error(s) found**\n\n`

      // Build errors
      if (overlayState.buildError) {
        output += '### Build Error\n\n'
        output += '```\n'
        output += overlayState.buildError
        output += '\n```\n\n'
      }

      // Runtime errors with source-mapped stack traces
      if (overlayState.errors.length > 0) {
        const runtimeErrors = await formatRuntimeError(
          overlayState.errors,
          overlayState.routerType === 'app'
        )
        output += runtimeErrors
        output += '\n'
      }

      output += '---\n\n'
    }
  }

  return output.trim()
}
