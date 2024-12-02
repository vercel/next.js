import {
  parseStack,
  type StackFrame,
} from '../../client/components/react-dev-overlay/server/middleware-webpack'
import { replaceErrorStack } from '../../client/components/react-dev-overlay/internal/helpers/node-stack-frames'

export type OriginalStacks = (string | undefined)[]

export const AFTER_CALLBACK_TOP_FRAME = 'next-after-callback-top-frame'

export function patchAfterCallstackInDev(
  error: Error,
  originalStacks: OriginalStacks
) {
  // TODO: if the callback is unnamed, replace <unknown> with <after callback>?

  // TODO: source mapping seems a bit broken in webpack -- the bottom frame is incorrectly called "helper" Page instead of "frame".
  // kinda looks like it's misusing the source location and it just falls into `helper`, see test/nested/page.js w/o turbo

  const frames = createCleanCallstackForAfterCallback(error, originalStacks)
  const origErrorStack = error.stack
  if (frames) {
    replaceErrorStack(error, frames)
  }

  console.log('AfterContext :: patchAfterCallstack', {
    errorStack: origErrorStack,
    originalStacks: originalStacks,
    finalStack: error.stack,
    finalStack_parsed: parseStack(error.stack),
  })

  return error
}

const createCleanCallstackForAfterCallback = (
  err: Error,
  originalStacks: OriginalStacks
): StackFrame[] | undefined => {
  const stripFramesAboveCallback = (stack: string | undefined) => {
    const frames = parseStack(stack)

    // slice off everything above the user callback -- that's next.js internals
    const topFrameIx = frames.findIndex(
      (frame) => frame.methodName.endsWith(AFTER_CALLBACK_TOP_FRAME) // it might be "async [name]"
    )
    if (topFrameIx === -1) {
      return
    }
    // last index is not included, so this also omits the wrapper we add in addCallback
    return frames.slice(0, topFrameIx)
  }

  const maybeUserFramesFromCallback = stripFramesAboveCallback(err.stack)
  if (!maybeUserFramesFromCallback) {
    // didn't find the top frame, something is wrong, bail out
    return
  }

  let userFramesFromCallback = maybeUserFramesFromCallback

  if (originalStacks) {
    for (let i = 0; i < originalStacks.length - 1; i++) {
      const frames = stripFramesAboveCallback(originalStacks[i])
      if (frames) {
        userFramesFromCallback = userFramesFromCallback.concat(frames)
      }
    }
  }

  const originalStack = originalStacks?.at(-1)
  const originalFrames = parseStack(originalStack)

  const userFramesFromOriginalCaller = originalFrames.slice(
    0,
    originalFrames.findIndex(
      (frame) => frame.methodName === 'react-stack-bottom-frame'
    )
  )

  return userFramesFromCallback.concat(userFramesFromOriginalCaller)
}
