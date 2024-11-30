import {
  ACTION_AFTER_ERROR,
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
  frames: OriginalStackFrame[]
  componentStackFrames?: ComponentStackFrame[]
}

export async function getErrorByType(
  ev: SupportedErrorEvent,
  isAppDir: boolean
): Promise<ReadyRuntimeError> {
  const { id, event } = ev
  switch (event.type) {
    case ACTION_AFTER_ERROR:
    case ACTION_UNHANDLED_ERROR:
    case ACTION_UNHANDLED_REJECTION: {
      const readyRuntimeError: ReadyRuntimeError = {
        id,
        runtime: true,
        error: event.reason,
        frames: await getOriginalStackFrames(
          event.frames,
          getErrorSource(event.reason),
          isAppDir,
          event.reason.toString()
        ),
      }
      console.log(
        'getErrorByType',
        event.frames,
        '=>',
        readyRuntimeError.frames
      )
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
