import {
  parseStack,
  type StackFrame,
} from '../../client/components/react-dev-overlay/internal/helpers/parse-stack'
import { replaceErrorStack } from '../../client/components/react-dev-overlay/internal/helpers/node-stack-frames'
import type { AfterTaskStore } from '../app-render/after-task-async-storage.external'
import { inspect } from 'node:util'

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

  const userFramesFromError = transformMarkedFrames(errorFrames)
  if (!userFramesFromError) {
    // something weird is going on, bail out
    return
  }

  // the callers of each nested `after`
  let userFramesFromTaskCallers: StackFrame[] = []
  if (nestedTaskCallerStacks) {
    for (let i = 0; i < nestedTaskCallerStacks.length; i++) {
      const frames = transformMarkedFrames(
        parseStack(nestedTaskCallerStacks[i].stack)
      )
      if (!frames) {
        // same as the error frame above -- no marker found, so we bail out.
        return
      }
      userFramesFromTaskCallers = userFramesFromTaskCallers.concat(frames)
    }
  }

  // the caller of the root `after`
  let rootCallerFrames = parseStack(rootTaskCallerStack.stack)

  // if the root caller was a promise, it might be marked too, but it doesn't have to be
  rootCallerFrames = transformMarkedFrames(rootCallerFrames) ?? rootCallerFrames

  // (is only added in dev)
  const reactBottomFrameIndex = rootCallerFrames.findIndex(
    (frame) => frame.methodName === 'react-stack-bottom-frame'
  )
  const userFramesFromRootCaller =
    reactBottomFrameIndex !== -1
      ? rootCallerFrames.slice(0, reactBottomFrameIndex)
      : rootCallerFrames

  // the owner stack above the caller of the root `after`
  // (is only available in dev)
  const framesFromReactOwner = rootTaskReactOwnerStack
    ? parseStack(
        // hack: parseStack expects the first line to be an error message
        'FakeError: ' + rootTaskReactOwnerStack
      )
    : []

  return userFramesFromError.concat(
    userFramesFromTaskCallers,
    userFramesFromRootCaller,
    framesFromReactOwner
  )
}

function getAsyncPlaceholderFrame(): StackFrame {
  return {
    methodName: '<async execution of after callback>',
    arguments: [],
    file: '<anonymous>',
    column: null,
    lineNumber: null,
  }
}

function transformMarkedFrames(frames: StackFrame[]) {
  const newFrames = stripFramesOutsideMarker(frames)
  if (!newFrames) return undefined
  return [...newFrames, getAsyncPlaceholderFrame()]
}

function stripFramesOutsideMarker(frames: StackFrame[]) {
  // slice off everything above the user callback -- that's next.js internals
  const topFrameIx = frames.findIndex(isAnyMarkerFrame)
  if (topFrameIx === -1) {
    return undefined
  }
  // last index is not included, so this also omits the marker frame
  return frames.slice(0, topFrameIx)
}

function isAnyMarkerFrame(frame: StackFrame) {
  return isCallbackMarkerFrame(frame) || isPromiseMarkerFrame(frame)
}

function isPromiseMarkerFrame(frame: StackFrame) {
  return frame.methodName.endsWith(AFTER_PROMISE_MARKER_FRAME) // it might be "async [name]"
}
function isCallbackMarkerFrame(frame: StackFrame) {
  return frame.methodName.endsWith(AFTER_CALLBACK_MARKER_FRAME) // it might be "async [name]"
}
