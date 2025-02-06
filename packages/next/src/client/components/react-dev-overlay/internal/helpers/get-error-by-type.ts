import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../../shared'
import type { SupportedErrorEvent } from '../container/Errors'
import { getOriginalStackFrames } from './stack-frame'
import type { OriginalStackFrame } from './stack-frame'
import type { ComponentStackFrame } from './parse-component-stack'
import { getErrorSource } from '../../../../../shared/lib/error-source'
import React from 'react'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error
  frames: OriginalStackFrame[] | (() => Promise<OriginalStackFrame[]>)
  componentStackFrames?: ComponentStackFrame[]
}

export const useFrames = (error: ReadyRuntimeError): OriginalStackFrame[] => {
  if ('use' in React) {
    const frames = error.frames

    if (typeof frames !== 'function') {
      throw new Error(
        'Invariant: frames must be a function when the React version has React.use. This is a bug in Next.js.'
      )
    }

    return React.use((frames as () => Promise<OriginalStackFrame[]>)())
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
  ev: SupportedErrorEvent,
  isAppDir: boolean
): Promise<ReadyRuntimeError> {
  const { id, event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      const baseError = {
        id,
        runtime: true,
        error: event.reason,
      } as const

      if ('use' in React) {
        const readyRuntimeError: ReadyRuntimeError = {
          ...baseError,
          // createMemoizedPromise dedups calls to getOriginalStackFrames
          frames: createMemoizedPromise(async () => {
            return await getOriginalStackFrames(
              event.frames,
              getErrorSource(event.reason),
              isAppDir
            )
          }),
        }
        if (event.type === ACTION_UNHANDLED_ERROR) {
          readyRuntimeError.componentStackFrames = event.componentStackFrames
        }
        return readyRuntimeError
      } else {
        const readyRuntimeError: ReadyRuntimeError = {
          ...baseError,
          // createMemoizedPromise dedups calls to getOriginalStackFrames
          frames: await getOriginalStackFrames(
            event.frames,
            getErrorSource(event.reason),
            isAppDir
          ),
        }
        if (event.type === ACTION_UNHANDLED_ERROR) {
          readyRuntimeError.componentStackFrames = event.componentStackFrames
        }
        return readyRuntimeError
      }
    }
    default: {
      break
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _: never = event
  throw new Error('type system invariant violation')
}

function createMemoizedPromise<T>(
  promiseFactory: () => Promise<T>
): () => Promise<T> {
  const cachedPromise = promiseFactory()
  return function (): Promise<T> {
    return cachedPromise
  }
}
