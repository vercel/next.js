import type { SupportedErrorEvent } from '../container/runtime-error/render-error'
import { getOriginalStackFrames } from '../../shared/stack-frame'
import type { OriginalStackFrame } from '../../shared/stack-frame'
import { getErrorSource } from '../../../shared/lib/error-source'
import { parseStack } from '../../../server/lib/parse-stack'
import React from 'react'

export type ReadyErrorCause =
  | {
      error: Error
      frames: () => Promise<readonly OriginalStackFrame[]>
      cause?: ReadyErrorCause
    }
  | {
      error: AggregateError
      frames: () => Promise<readonly OriginalStackFrame[]>
      cause?: ReadyErrorCause
      aggregateErrors: ReadyErrorCause[] | null
    }

export type ReadyRuntimeError =
  | {
      id: number
      runtime: true
      error: Error & { environmentName?: string }
      frames: () => Promise<readonly OriginalStackFrame[]>
      type: 'runtime' | 'console' | 'recoverable'
      cause?: ReadyErrorCause
    }
  | {
      id: number
      runtime: true
      error: AggregateError & { environmentName?: string }
      frames: () => Promise<readonly OriginalStackFrame[]>
      type: 'runtime' | 'console' | 'recoverable'
      cause?: ReadyErrorCause
      aggregateErrors: ReadyErrorCause[] | null
    }

export const useFrames = (
  error: ReadyRuntimeError | null
): readonly OriginalStackFrame[] => {
  if (!error) return []

  const frames = error.frames
  return React.use(frames())
}

export function getErrorByType(
  event: SupportedErrorEvent,
  isAppDir: boolean
): ReadyRuntimeError {
  if (event.error instanceof AggregateError) {
    const readyRuntimeError: ReadyRuntimeError = {
      id: event.id,
      runtime: true,
      error: event.error,
      type: event.type,
      // createMemoizedPromise dedups calls to getOriginalStackFrames
      frames: createMemoizedPromise(async () => {
        return await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.error),
          isAppDir
        )
      }),
      cause: getCauseChain(event.error, isAppDir),
      aggregateErrors: getAggregateErrors(event.error, isAppDir),
    }
    return readyRuntimeError
  } else {
    const readyRuntimeError: ReadyRuntimeError = {
      id: event.id,
      runtime: true,
      error: event.error,
      type: event.type,
      // createMemoizedPromise dedups calls to getOriginalStackFrames
      frames: createMemoizedPromise(async () => {
        return await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.error),
          isAppDir
        )
      }),
      cause: getCauseChain(event.error, isAppDir),
    }
    return readyRuntimeError
  }
}

function getCauseChain(
  error: Error,
  isAppDir: boolean,
  depth: number = 0
): ReadyErrorCause | undefined {
  if (depth >= 5) return undefined
  const cause = error.cause
  if (!(cause instanceof Error)) return undefined

  const frames = parseStack(cause.stack || '')
  if (cause instanceof AggregateError) {
    return {
      error: cause,
      frames: createMemoizedPromise(async () => {
        return await getOriginalStackFrames(
          frames,
          getErrorSource(cause),
          isAppDir
        )
      }),
      cause: getCauseChain(cause, isAppDir, depth + 1),
      aggregateErrors: getAggregateErrors(cause, isAppDir, depth + 1),
    }
  } else {
    return {
      error: cause,
      frames: createMemoizedPromise(async () => {
        return await getOriginalStackFrames(
          frames,
          getErrorSource(cause),
          isAppDir
        )
      }),
      cause: getCauseChain(cause, isAppDir, depth + 1),
    }
  }
}

function getAggregateErrors(
  error: AggregateError,
  isAppDir: boolean,
  depth: number = 0
): ReadyErrorCause[] | null {
  if (depth >= 5) {
    return null
  }
  if (error.errors.length === 0) {
    return null
  }

  const maxErrors = 5
  const readyErrors: ReadyErrorCause[] = []
  for (let i = 0; i < error.errors.length; i++) {
    const childError = error.errors[i]
    if (childError instanceof AggregateError) {
      const frames = parseStack(childError.stack || '')
      readyErrors.push({
        error: childError,
        frames: createMemoizedPromise(async () => {
          return await getOriginalStackFrames(
            frames,
            getErrorSource(childError),
            isAppDir
          )
        }),
        cause: getCauseChain(childError, isAppDir, depth + 1),
        aggregateErrors: getAggregateErrors(childError, isAppDir, depth + 1),
      })
    } else if (childError instanceof Error) {
      const frames = parseStack(childError.stack || '')
      readyErrors.push({
        error: childError,
        frames: createMemoizedPromise(async () => {
          return await getOriginalStackFrames(
            frames,
            getErrorSource(childError),
            isAppDir
          )
        }),
        cause: getCauseChain(childError, isAppDir, depth + 1),
      })
    }

    if (readyErrors.length >= maxErrors) {
      break
    }
  }

  return readyErrors
}

function createMemoizedPromise<T>(
  promiseFactory: () => Promise<T>
): () => Promise<T> {
  const cachedPromise = promiseFactory()
  return function (): Promise<T> {
    return cachedPromise
  }
}
