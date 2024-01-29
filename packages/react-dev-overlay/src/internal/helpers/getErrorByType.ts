import { TYPE_UNHANDLED_ERROR, TYPE_UNHANDLED_REJECTION } from '../bus'
import type { SupportedErrorEvent } from '../container/Errors'
import { getErrorSource } from './nodeStackFrames'
import type { OriginalStackFrame } from './stack-frame'
import { getOriginalStackFrames } from './stack-frame'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error
  frames: OriginalStackFrame[]
  componentStack?: string[]
}

export async function getErrorByType(
  ev: SupportedErrorEvent
): Promise<ReadyRuntimeError> {
  const { id, event } = ev
  switch (event.type) {
    case TYPE_UNHANDLED_ERROR:
    case TYPE_UNHANDLED_REJECTION: {
      const readyRuntimeError: ReadyRuntimeError = {
        id,
        runtime: true,
        error: event.reason,
        frames: await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.reason),
          event.reason.toString()
        ),
      }
      if (event.type === TYPE_UNHANDLED_ERROR) {
        readyRuntimeError.componentStack = event.componentStack
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
