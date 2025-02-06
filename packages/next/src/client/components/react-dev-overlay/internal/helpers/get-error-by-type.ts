import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../../shared'
import type { SupportedErrorEvent } from '../container/Errors'
import { getOriginalStackFrames } from './stack-frame'
import type { OriginalStackFrame } from './stack-frame'
import type { ComponentStackFrame } from './parse-component-stack'
import { getErrorSource } from '../../../../../shared/lib/error-source'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error
  frames: () => Promise<OriginalStackFrame[]>
  componentStackFrames?: ComponentStackFrame[]
}

export function getErrorByType(
  ev: SupportedErrorEvent,
  isAppDir: boolean
): ReadyRuntimeError {
  const { id, event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      const readyRuntimeError: ReadyRuntimeError = {
        id,
        runtime: true,
        error: event.reason,
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
