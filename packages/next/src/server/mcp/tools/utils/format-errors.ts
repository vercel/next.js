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

interface StackFrame {
  file: string
  methodName: string
  line: number | null
  column: number | null
}

interface FormattedRuntimeError {
  type: string
  errorName: string
  message: string
  stack: StackFrame[]
}

interface FormattedSessionError {
  url: string
  buildError: string | null
  runtimeErrors: FormattedRuntimeError[]
}

interface FormattedConfigError {
  name: string
  message: string
  stack: string | null
}

export interface FormattedErrorsOutput {
  configErrors: FormattedConfigError[]
  sessionErrors: FormattedSessionError[]
}

const formatStackFrameToObject = (
  frame: StackFrameForFormatting
): StackFrame => {
  return {
    file: frame.file || '<unknown>',
    methodName: frame.methodName || '<anonymous>',
    line: frame.line1,
    column: frame.column1,
  }
}

const resolveErrorFrames = async (
  frames: readonly StackFrameForFormatting[],
  context: {
    isServer: boolean
    isEdgeServer: boolean
    isAppDirectory: boolean
  }
): Promise<StackFrame[]> => {
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

    return resolvedFrames
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
          ? formatStackFrameToObject(resolvedFrame.value.originalStackFrame)
          : formatStackFrameToObject(frames[j])
      )
  } catch {
    return frames.map(formatStackFrameToObject)
  }
}

async function formatRuntimeErrorsToObjects(
  errors: readonly SupportedErrorEvent[],
  isAppDirectory: boolean
): Promise<FormattedRuntimeError[]> {
  const formattedErrors: FormattedRuntimeError[] = []

  for (const error of errors) {
    const errorName = error.error?.name || 'Error'
    const errorMsg = error.error?.message || 'Unknown error'

    let stack: StackFrame[] = []
    if (error.frames?.length) {
      const errorSource = getErrorSource(error.error)
      stack = await resolveErrorFrames(error.frames, {
        isServer: errorSource === 'server',
        isEdgeServer: errorSource === 'edge-server',
        isAppDirectory,
      })
    }

    formattedErrors.push({
      type: error.type,
      errorName,
      message: errorMsg,
      stack,
    })
  }

  return formattedErrors
}

export async function formatErrors(
  errorsByUrl: Map<string, OverlayState>,
  nextInstanceErrors: { nextConfig: unknown[] } = { nextConfig: [] }
): Promise<FormattedErrorsOutput> {
  const output: FormattedErrorsOutput = {
    configErrors: [],
    sessionErrors: [],
  }

  // Format Next.js instance errors first (e.g., next.config.js errors)
  for (const error of nextInstanceErrors.nextConfig) {
    if (error instanceof Error) {
      output.configErrors.push({
        name: error.name,
        message: error.message,
        stack: error.stack || null,
      })
    } else {
      output.configErrors.push({
        name: 'Error',
        message: String(error),
        stack: null,
      })
    }
  }

  // Format browser session errors
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

    const runtimeErrors = await formatRuntimeErrorsToObjects(
      overlayState.errors,
      overlayState.routerType === 'app'
    )

    output.sessionErrors.push({
      url: displayUrl,
      buildError: overlayState.buildError || null,
      runtimeErrors,
    })
  }

  return output
}
