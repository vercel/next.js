import {
  parseStack,
  type StackFrame,
} from '../../client/components/react-dev-overlay/server/middleware-webpack'
import { replaceErrorStack } from '../../client/components/react-dev-overlay/internal/helpers/node-stack-frames'
import type { AfterTaskStore } from '../app-render/after-task-async-storage.external'

export const AFTER_CALLBACK_MARKER_FRAME = 'next-after-callback-marker-frame'

export type AfterTaskStackInfo = Pick<
  AfterTaskStore,
  'rootTaskReactOwnerStack' | 'rootTaskCallerStack' | 'nestedTaskCallerStacks'
>

export function stitchAfterCallstack(
  error: Error,
  stackInfo: AfterTaskStackInfo
) {
  // TODO: if the callback is unnamed, replace <unknown> with <after callback>?

  // TODO: source mapping seems a bit broken in webpack -- the bottom frame is incorrectly called "helper" Page instead of "frame".
  // kinda looks like it's misusing the source location and it just falls into `helper`, see test/nested/page.js w/o turbo

  const frames = getStitchedAfterCallstack(error, stackInfo)
  const origErrorStack = error.stack
  if (frames) {
    replaceErrorStack(error, frames)
  }

  console.log('AfterContext :: patchAfterCallstack', {
    errorStack: origErrorStack,
    nestedTaskCallerStacks: stackInfo.nestedTaskCallerStacks?.map(
      (e) => e?.stack
    ),
    rootTaskCallerStack: stackInfo.rootTaskCallerStack?.stack,
    rootTaskReactOwnerStack: stackInfo.rootTaskReactOwnerStack,
    finalStack: frames ? error.stack : '<unchanged>',
  })

  return error
}

function getStitchedAfterCallstack(
  error: Error,
  {
    rootTaskReactOwnerStack,
    rootTaskCallerStack,
    nestedTaskCallerStacks,
  }: AfterTaskStackInfo
): StackFrame[] | undefined {
  let errorFrames = parseStack(error.stack)

  const userFramesFromError = stripFramesOutsideCallback(errorFrames)
  if (!userFramesFromError) {
    // If we didn't find a marker frame, we're almost certainly in a `after(promise)` call
    // or something like `setTimeout(() => after(...))`.
    //
    // If it's a promise, we can't guarantee that we'll attach all the caller stacks that we should,
    // because `after(promise)` cannot affect the promise's ALS context,
    // so e.g. this won't include `foo` and its callers -- `rootTaskCallerStack` will start at `bar`:
    //
    //   async function foo() {
    //     await setTimeout(0);
    //     after(bar());
    //   }
    //   async function bar() {
    //     await setTimeout(0);
    //     after(zap());
    //   }
    //
    //   async function zap() {
    //     await setTimeout(0);
    //     throw new Error('kaboom');
    //   }
    //
    //   foo();
    //
    // (omitting `setTimeout(0)` seems to make it work -- I guess it's different if it's just microtasks?)
    //
    // Honestly, maybe I'm missing something here, but the above example
    // is stubbornly missing `foo` no matter what I do, which results in a confusing callstack.
    // Bailing out here prevents that, so I'm sticking with it.
    return
  }

  // the callers of each nested `after`
  let userFramesFromTaskCallers: StackFrame[] = []
  if (nestedTaskCallerStacks) {
    for (let i = 0; i < nestedTaskCallerStacks.length; i++) {
      const frames = stripFramesOutsideCallback(
        parseStack(nestedTaskCallerStacks[i]?.stack)
      )
      if (!frames) {
        // same as the error frame above -- no marker found, so we bail out.
        return
      }
      userFramesFromTaskCallers = userFramesFromTaskCallers.concat(frames)
    }
  }

  // the caller of the root `after`
  const rootCallerFrames = parseStack(rootTaskCallerStack.stack)
  const userFramesFromRootCaller = rootCallerFrames.slice(
    0,
    rootCallerFrames.findIndex(
      (frame) => frame.methodName === 'react-stack-bottom-frame'
    )
  )

  // the owner stack above the caller of the root `after`
  const framesFromReactOwner = rootTaskReactOwnerStack
    ? parseStack(
        // hack: parseStack expects the first like to be an error message
        'FakeError: ' + rootTaskReactOwnerStack
      )
    : []

  return errorFrames.concat(
    userFramesFromTaskCallers,
    userFramesFromRootCaller,
    framesFromReactOwner
  )
}

const stripFramesOutsideCallback = (frames: StackFrame[]) => {
  // slice off everything above the user callback -- that's next.js internals
  const topFrameIx = frames.findIndex(
    (frame) => frame.methodName.endsWith(AFTER_CALLBACK_MARKER_FRAME) // it might be "async [name]"
  )
  if (topFrameIx === -1) {
    return
  }
  // last index is not included, so this also omits the wrapper we add in addCallback
  return frames.slice(0, topFrameIx)
}
