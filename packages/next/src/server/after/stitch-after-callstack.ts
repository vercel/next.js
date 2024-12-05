import {
  parseStack,
  type StackFrame,
} from '../../client/components/react-dev-overlay/server/middleware-webpack'
import { replaceErrorStack } from '../../client/components/react-dev-overlay/internal/helpers/node-stack-frames'
import type { AfterTaskStore } from '../app-render/after-task-async-storage.external'
import { inspect } from 'node:util'

export const STITCH_CALLSTACKS =
  process.env.STITCH_CALLSTACKS !== undefined
    ? !!JSON.parse(process.env.STITCH_CALLSTACKS)
    : true
export const SKIP_PROMISES =
  process.env.SKIP_PROMISES !== undefined
    ? !!JSON.parse(process.env.SKIP_PROMISES)
    : true
export const ADD_ASYNC_PLACEHOLDER =
  process.env.ADD_ASYNC_PLACEHOLDER !== undefined
    ? !!JSON.parse(process.env.ADD_ASYNC_PLACEHOLDER)
    : true

export const AFTER_CALLBACK_MARKER_FRAME = 'next-after-callback-marker-frame'
export const AFTER_PROMISE_MARKER_FRAME = 'next-after-promise-marker-frame'

export type AfterTaskStackInfo = Pick<
  AfterTaskStore,
  'rootTaskReactOwnerStack' | 'rootTaskCallerStack' | 'nestedTaskCallerStacks'
>

/** An error that's only used for capturing stack traces. */
export class CaptureStackTrace extends Error {}

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

  console.log('='.repeat(60))
  console.log('AfterContext :: stitchAfterCallstack')
  const indent = (depth: number, str: string) =>
    str
      .split('\n')
      .map((line) => ' '.repeat(depth) + line)
      .join('\n')
  const stackToStr = (str: string | null | undefined) =>
    indent(4, !str ? inspect(str) : str)
  console.log('  errorStack:')
  console.log(stackToStr(origErrorStack))
  console.log(
    '  nestedTaskCallerStacks:',
    ...(!stackInfo.nestedTaskCallerStacks
      ? [stackInfo.nestedTaskCallerStacks]
      : [])
  )
  if (stackInfo.nestedTaskCallerStacks) {
    for (const stack of stackInfo.nestedTaskCallerStacks?.map(
      (e) => e?.stack
    )) {
      console.log(stackToStr(stack))
    }
  }
  console.log('  rootTaskCallerStack:')
  console.log(stackToStr(stackInfo.rootTaskCallerStack?.stack))
  console.log('  rootTaskReactOwnerStack:')
  console.log(stackToStr(stackInfo.rootTaskReactOwnerStack))
  console.log('  finalStack:')
  console.log(stackToStr(frames ? error.stack : '<unchanged>'))
  console.log('='.repeat(60))

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
  const errorFrames = parseStack(error.stack)

  let userFramesFromError = stripFramesOutsideCallback(errorFrames)
  if (SKIP_PROMISES) {
    if (!userFramesFromError) {
      // If we didn't find a marker frame, we're almost certainly in a `unstable_after(promise)` call
      // or something like `setTimeout(() => unstable_after(...))`.
      //
      // If it's a promise, we can't guarantee that we'll attach all the caller stacks that we should,
      // because `unstable_after(promise)` cannot affect the promise's ALS context,
      // so e.g. this won't include `foo` and its callers -- `rootTaskCallerStack` will start at `bar`:
      //
      //   async function foo() {
      //     await setTimeout(0);
      //     unstable_after(bar());
      //   }
      //   async function bar() {
      //     await setTimeout(0);
      //     unstable_after(zap());
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
  } else {
    userFramesFromError ??= errorFrames
  }

  // the callers of each nested `unstable_after`
  let userFramesFromTaskCallers: StackFrame[] = []
  if (nestedTaskCallerStacks) {
    for (let i = 0; i < nestedTaskCallerStacks.length; i++) {
      const rawFrames = parseStack(nestedTaskCallerStacks[i].stack)
      let frames = stripFramesOutsideCallback(rawFrames)
      if (SKIP_PROMISES) {
        if (!frames) {
          // same as the error frame above -- no marker found, so we bail out.
          return
        }
        if (hasPromiseMarkerFrame(frames)) {
          return
        }

        if (ADD_ASYNC_PLACEHOLDER) {
          addAsyncPlaceholderFrame(frames)
        }
        userFramesFromTaskCallers = userFramesFromTaskCallers.concat(frames)
      } else {
        frames ??= rawFrames
        addAsyncPlaceholderFrame(frames)
        userFramesFromTaskCallers = userFramesFromTaskCallers.concat(frames)
      }
    }
  }

  // the caller of the root `unstable_after`
  const rootCallerFrames = parseStack(rootTaskCallerStack.stack)

  if (SKIP_PROMISES) {
    if (hasPromiseMarkerFrame(rootCallerFrames)) {
      // this stack of afters started from a promise passed to after: `unstable_after(foo())`
      // (where `foo` called the after whose error we're handling now)
      // we cannot trust that the root stack is attacheable to the react owner stack,
      // so bail out.
      return
    }
  }

  if (ADD_ASYNC_PLACEHOLDER) {
    addAsyncPlaceholderFrame(rootCallerFrames)
  }

  const reactBottomFrameIndex = rootCallerFrames.findIndex(
    (frame) => frame.methodName === 'react-stack-bottom-frame'
  )
  const userFramesFromRootCaller =
    reactBottomFrameIndex !== -1
      ? rootCallerFrames.slice(0, reactBottomFrameIndex)
      : rootCallerFrames

  // the owner stack above the caller of the root `unstable_after`
  const framesFromReactOwner = rootTaskReactOwnerStack
    ? parseStack(
        // hack: parseStack expects the first like to be an error message
        'FakeError: ' + rootTaskReactOwnerStack
      )
    : []

  return userFramesFromError.concat(
    userFramesFromTaskCallers,
    userFramesFromRootCaller,
    framesFromReactOwner
  )
}

function addAsyncPlaceholderFrame(frames: StackFrame[]) {
  frames.unshift({
    methodName: '<async execution of unstable_after>',
    file: '<anonymous>',
    lineNumber: null,
    column: null,
    arguments: [],
  })
}

function hasPromiseMarkerFrame(frames: StackFrame[]) {
  return frames.some(isPromiseMarkerFrame)
}

function isPromiseMarkerFrame(frame: StackFrame) {
  return frame.methodName.endsWith(AFTER_PROMISE_MARKER_FRAME) // it might be "async [name]"
}

function stripFramesOutsideCallback(frames: StackFrame[]) {
  // slice off everything above the user callback -- that's next.js internals
  const topFrameIx = frames.findIndex(isCallbackMarkerFrame)
  if (topFrameIx === -1) {
    return
  }
  // last index is not included, so this also omits the marker frame
  return frames.slice(0, topFrameIx)
}

function isCallbackMarkerFrame(frame: StackFrame) {
  return frame.methodName.endsWith(AFTER_CALLBACK_MARKER_FRAME) // it might be "async [name]"
}
