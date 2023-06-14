import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../error-overlay-reducer'
import { SupportedErrorEvent } from '../container/Errors'
import { getErrorSource } from './nodeStackFrames'
import { getOriginalStackFrames, OriginalStackFrame } from './stack-frame'
import { ComponentStackFrame } from './parse-component-stack'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error
  frames: OriginalStackFrame[]
  componentStackFrames?: ComponentStackFrame[]
}

export async function getErrorByType(
  ev: SupportedErrorEvent
): Promise<ReadyRuntimeError> {
  const { id, event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
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
