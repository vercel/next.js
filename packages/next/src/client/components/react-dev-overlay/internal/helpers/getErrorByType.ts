import {
  ACTION_UNHANDLED_ERROR,
  ACTION_UNHANDLED_REJECTION,
} from '../error-overlay-reducer'
import type { SupportedErrorEvent } from '../container/Errors'
import { getErrorSource } from './nodeStackFrames'
import { getOriginalStackFrames } from './stack-frame'
import type { OriginalStackFrame } from './stack-frame'
import type { ComponentStackFrame } from './parse-component-stack'

export type ReadyRuntimeError = {
  id: number
  runtime: true
  error: Error
  frames: OriginalStackFrame[]
  componentStackFrames?: ComponentStackFrame[]
  complete: boolean
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
        complete: true,
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

export function getUnresolvedErrorByType(
  ev: SupportedErrorEvent
): ReadyRuntimeError {
  const { id, event } = ev
  switch (event.type) {
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      return {
        id,
        runtime: true,
        error: event.reason,
        frames: event.frames.map((frame) => ({
          error: true,
          reason: 'unresolved',
          external: false,
          expanded: false,
          sourceStackFrame: frame,
          originalStackFrame: null,
          originalCodeFrame: null,
        })),
        complete: false,
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
