import { randomUUID } from 'crypto'
import type {
  FormattedRuntimeError,
  HmrMessageSentToBrowser,
  RuntimeErrorStateError,
  RuntimeErrorStateUpdate,
} from './hot-reloader-types'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  HMR_MESSAGE_SENT_TO_SERVER,
  type RuntimeErrorStateMessage,
} from './hot-reloader-types'
import { getErrorSource } from '../../shared/lib/error-source'
import type {
  OriginalStackFramesRequest,
  OriginalStackFramesResponse,
} from '../../next-devtools/server/shared'

type StackFrameForFormatting = {
  file: string | null
  methodName: string
  line1: number | null
  column1: number | null
}

type RuntimeErrorForFormatting = Omit<RuntimeErrorStateError, 'error'> & {
  error: RuntimeErrorStateError['error'] | Error
}

type RuntimeErrorStateFormatter = (
  errors: readonly RuntimeErrorStateError[],
  isAppDirectory: boolean
) => Promise<FormattedRuntimeError[]>

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

const formatStackFrameToObject = (
  frame: StackFrameForFormatting
): FormattedRuntimeError['stack'][number] => {
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
): Promise<FormattedRuntimeError['stack']> => {
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

    return resolvedFrames.flatMap((resolvedFrame, index) => {
      if (
        resolvedFrame.status === 'fulfilled' &&
        resolvedFrame.value.originalStackFrame?.ignored
      ) {
        return []
      }

      return [
        resolvedFrame.status === 'fulfilled' &&
        resolvedFrame.value.originalStackFrame
          ? formatStackFrameToObject(resolvedFrame.value.originalStackFrame)
          : formatStackFrameToObject(frames[index]),
      ]
    })
  } catch {
    return frames.map(formatStackFrameToObject)
  }
}

export async function formatRuntimeErrors(
  errors: readonly RuntimeErrorForFormatting[],
  isAppDirectory: boolean
): Promise<FormattedRuntimeError[]> {
  const formattedErrors: FormattedRuntimeError[] = []

  for (const error of errors) {
    const errorName = error.error?.name || 'Error'
    const message = error.error?.message || 'Unknown error'

    let stack: FormattedRuntimeError['stack'] = []
    if (error.frames?.length) {
      const errorSource =
        error.error instanceof Error
          ? getErrorSource(error.error)
          : error.error?.source

      stack = await resolveErrorFrames(error.frames, {
        isServer: errorSource === 'server',
        isEdgeServer: errorSource === 'edge-server',
        isAppDirectory,
      })
    }

    formattedErrors.push({
      type: error.type,
      errorName,
      message,
      fatal: error.fatal,
      stack,
    })
  }

  return formattedErrors
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isRuntimeErrorStateError(
  value: unknown
): value is RuntimeErrorStateError {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isFinite(value.id) ||
    (value.type !== 'runtime' &&
      value.type !== 'recoverable' &&
      value.type !== 'console') ||
    typeof value.fatal !== 'boolean' ||
    !Array.isArray(value.frames)
  ) {
    return false
  }

  if (value.error !== null) {
    if (!isRecord(value.error)) {
      return false
    }
    if (
      (value.error.name !== undefined &&
        typeof value.error.name !== 'string') ||
      (value.error.message !== undefined &&
        typeof value.error.message !== 'string') ||
      (value.error.stack !== undefined &&
        typeof value.error.stack !== 'string') ||
      (value.error.source !== null &&
        value.error.source !== 'server' &&
        value.error.source !== 'edge-server')
    ) {
      return false
    }
  }

  return value.frames.every(
    (frame) =>
      isRecord(frame) &&
      isNullableString(frame.file) &&
      typeof frame.methodName === 'string' &&
      isNullableNumber(frame.line1) &&
      isNullableNumber(frame.column1)
  )
}

export function isRuntimeErrorStateUpdate(
  value: unknown
): value is RuntimeErrorStateUpdate {
  if (
    !isRecord(value) ||
    value.event !== HMR_MESSAGE_SENT_TO_SERVER.RUNTIME_ERRORS ||
    typeof value.pathname !== 'string' ||
    !value.pathname.startsWith('/') ||
    value.pathname.includes('?') ||
    value.pathname.includes('#') ||
    !isRecord(value.errorState) ||
    !Array.isArray(value.errorState.errors) ||
    (value.errorState.routerType !== 'app' &&
      value.errorState.routerType !== 'pages')
  ) {
    return false
  }

  return value.errorState.errors.every(isRuntimeErrorStateError)
}

export function createRuntimeErrorStateHandler(
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  format: RuntimeErrorStateFormatter = formatRuntimeErrors,
  clientId: string = randomUUID()
) {
  let generation = 0
  let disposed = false
  let lastPublishedMessage: RuntimeErrorStateMessage | null = null
  const formattedErrorCache = new Map<string, Promise<FormattedRuntimeError>>()

  async function formatWithCache(
    errors: readonly RuntimeErrorStateError[],
    isAppDirectory: boolean
  ): Promise<FormattedRuntimeError[]> {
    const keys = errors.map(
      (error) => `${isAppDirectory ? 'app' : 'pages'}:${JSON.stringify(error)}`
    )
    const activeKeys = new Set(keys)
    const pending: Array<Promise<FormattedRuntimeError> | undefined> = []
    const missing: Array<{
      error: RuntimeErrorStateError
      key: string
      outputIndex: number
    }> = []

    for (let index = 0; index < errors.length; index++) {
      const key = keys[index]
      const cached = formattedErrorCache.get(key)
      if (cached) {
        pending[index] = cached
      } else {
        missing.push({ error: errors[index], key, outputIndex: index })
      }
    }

    if (missing.length > 0) {
      const batch = format(
        missing.map(({ error }) => error),
        isAppDirectory
      )
      for (let index = 0; index < missing.length; index++) {
        const { key, outputIndex } = missing[index]
        const formatted = batch
          .then((result) => {
            const error = result[index]
            if (!error) {
              throw new Error('Runtime error formatter returned no result')
            }
            return error
          })
          .catch((error) => {
            if (formattedErrorCache.get(key) === formatted) {
              formattedErrorCache.delete(key)
            }
            throw error
          })
        formattedErrorCache.set(key, formatted)
        pending[outputIndex] = formatted
      }
    }

    for (const key of formattedErrorCache.keys()) {
      if (!activeKeys.has(key)) {
        formattedErrorCache.delete(key)
      }
    }

    return Promise.all(
      pending.map((formatted) => {
        if (!formatted) {
          throw new Error('Runtime error formatter cache is incomplete')
        }
        return formatted
      })
    )
  }

  return {
    async handle(update: unknown): Promise<void> {
      if (disposed || !isRuntimeErrorStateUpdate(update)) {
        return
      }

      const currentGeneration = ++generation
      const errors = await formatWithCache(
        update.errorState.errors,
        update.errorState.routerType === 'app'
      )

      if (disposed || currentGeneration !== generation) {
        return
      }

      const message: RuntimeErrorStateMessage = {
        type: HMR_MESSAGE_SENT_TO_BROWSER.RUNTIME_ERRORS,
        clientId,
        pathname: update.pathname,
        errors,
      }
      sendHmrMessage(message)
      lastPublishedMessage = message
    },
    dispose(): void {
      if (disposed) {
        return
      }

      const clearMessage: RuntimeErrorStateMessage | null =
        lastPublishedMessage && lastPublishedMessage.errors.length > 0
          ? { ...lastPublishedMessage, errors: [] }
          : null
      disposed = true
      generation++
      formattedErrorCache.clear()
      lastPublishedMessage = null

      if (clearMessage) {
        sendHmrMessage(clearMessage)
      }
    },
  }
}
