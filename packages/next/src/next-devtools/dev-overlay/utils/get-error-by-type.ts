import type { SupportedErrorEvent } from '../container/runtime-error/render-error'
import { getOriginalStackFrames } from '../../shared/stack-frame'
import type { OriginalStackFrame } from '../../shared/stack-frame'
import { getErrorSource } from '../../../shared/lib/error-source'
import React from 'react'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error & { environmentName?: string }
  frames:
    | readonly OriginalStackFrame[]
    | (() => Promise<readonly OriginalStackFrame[]>)
  type: 'runtime' | 'console' | 'recoverable'
}

export const useFrames = (
  error: ReadyRuntimeError | null
): readonly OriginalStackFrame[] => {
  if (!error) return []

  if ('use' in React) {
    const frames = error.frames

    if (typeof frames !== 'function') {
      throw new Error(
        'Invariant: frames must be a function when the React version has React.use. This is a bug in Next.js.'
      )
    }

    return React.use((frames as () => Promise<readonly OriginalStackFrame[]>)())
  } else {
    if (!Array.isArray(error.frames)) {
      throw new Error(
        'Invariant: frames must be an array when the React version does not have React.use. This is a bug in Next.js.'
      )
    }

    return error.frames
  }
}

export async function getErrorByType(
  event: SupportedErrorEvent,
  isAppDir: boolean
): Promise<ReadyRuntimeError> {
  const baseError = {
    id: event.id,
    runtime: true,
    error: event.error,
    type: event.type,
  } as const

  if ('use' in React) {
    const readyRuntimeError: ReadyRuntimeError = {
      ...baseError,
      // createMemoizedPromise dedups calls to getOriginalStackFrames
      frames: createMemoizedPromise(async () => {
        return await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.error),
          isAppDir
        )
      }),
    }
    return readyRuntimeError
  } else {
    const readyRuntimeError: ReadyRuntimeError = {
      ...baseError,
      // createMemoizedPromise dedups calls to getOriginalStackFrames
      frames: await getOriginalStackFrames(
        event.frames,
        getErrorSource(event.error),
        isAppDir
      ),
    }
    return readyRuntimeError
  }
}

function createMemoizedPromise<T>(
  promiseFactory: () => Promise<T>
): () => Promise<T> {
  const cachedPromise = promiseFactory()
  return function (): Promise<T> {
    return cachedPromise
  }
}
