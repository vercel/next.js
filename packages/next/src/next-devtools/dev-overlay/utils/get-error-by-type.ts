import type { SupportedErrorEvent } from '../container/runtime-error/render-error'
import { getOriginalStackFrames } from '../../shared/stack-frame'
import type { OriginalStackFrame } from '../../shared/stack-frame'
import { getErrorSource } from '../../../shared/lib/error-source'
import React from 'react'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error & { environmentName?: string }
  frames: () => Promise<readonly OriginalStackFrame[]>
  type: 'runtime' | 'console' | 'recoverable'
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
  }
  return readyRuntimeError
}

function createMemoizedPromise<T>(
  promiseFactory: () => Promise<T>
): () => Promise<T> {
  const cachedPromise = promiseFactory()
  return function (): Promise<T> {
    return cachedPromise
  }
}
