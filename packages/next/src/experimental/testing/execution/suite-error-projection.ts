import { resolve } from 'node:path'
import { types } from 'node:util'
import type { RunnerSuiteTaskErrorOrigins } from '../runner/lifecycle'
import {
  getTestStackFrames,
  isTestFrameIgnored,
  isTestFrameOriginal,
} from '../reporting/test-stack-frames'
import type { RegistrationOrigin } from './registration-origin'
import type { Suite, Task } from '../runner/tasks'
import type { ReporterTaskResultProjection } from '../reporting/task-updates'
import { registerOriginalResultProjection } from '../reporting/live-tasks'

const isCapturedResultProxy = types.isProxy
const readCapturedDescriptor = Object.getOwnPropertyDescriptor

export interface CapturedErrorStack {
  method: string
  file: string
  line: number
  column: number
}

/** The actual host retains its leased artifact while captured stacks are mapped. */
export function createCapturedStackMapper(
  registrationOrigin: (stack: string) => RegistrationOrigin | undefined
): (
  stack: string,
  registeredOrigin?: RegistrationOrigin
) => CapturedErrorStack[] {
  return (stack, registeredOrigin) => {
    const frames = getTestStackFrames(stack, {
      reportInvalidSourceMaps: false,
    })
    const helper = frames.findLastIndex((frame) =>
      frame.frame.methodName?.includes('__VITEST_HELPER__')
    )
    const selected = frames.find(
      (frame) => isTestFrameOriginal(frame) && !isTestFrameIgnored(frame)
    )
    const origin = registeredOrigin ?? registrationOrigin(stack)
    return frames.slice(helper + 1).flatMap((captured) => {
      const frame = captured.frame
      if (
        isTestFrameIgnored(captured) ||
        !frame.file ||
        !frame.line1 ||
        !frame.column1
      )
        return []
      let file = frame.file
      if (file.startsWith('file://')) {
        file = file.slice(7)
        try {
          file = decodeURIComponent(file)
        } catch {
          // The pinned parser retains a malformed encoded path verbatim.
        }
      }
      file = /^[a-zA-Z]:[\\/]/.test(file)
        ? file.replace(/\\/g, '/')
        : resolve(file)
      const actualOrigin =
        captured === selected && origin?.location.file === file
          ? origin
          : undefined
      return [
        {
          method:
            actualOrigin?.methodName ??
            (frame.methodName === '<unknown>' || !frame.methodName
              ? ''
              : frame.methodName),
          file: actualOrigin?.location.file ?? file,
          line: actualOrigin?.location.line ?? frame.line1,
          column: actualOrigin?.location.column ?? frame.column1,
        },
      ]
    })
  }
}

function projectCapturedErrorStacks(
  capturedResult: Task['result'],
  mapActualStack: (stack: string, index: number) => CapturedErrorStack[]
): void {
  for (const [index, error] of (capturedResult?.errors ?? []).entries()) {
    if (!error || typeof error !== 'object') continue
    // The pinned host keeps an existing truthy parsed value, including [].
    if ('stacks' in error && error.stacks) continue
    const stack = error.stack || ''
    let frames = typeof stack === 'string' ? mapActualStack(stack, index) : []
    if (!frames.length) {
      if (
        error.fileName != null &&
        error.lineNumber != null &&
        error.columnNumber != null
      )
        frames = mapActualStack(
          `${error.fileName}:${error.lineNumber}:${error.columnNumber}`,
          index
        )
      if (
        error.sourceURL != null &&
        error.line != null &&
        error._column != null
      )
        frames = mapActualStack(
          `${error.sourceURL}:${error.line}:${error._column}`,
          index
        )
    }
    error.stacks = frames
  }
}

/** Map only the actual received Suite Error records, after normal capture finishes. */
export function createSuiteErrorResultProjection(
  owner: Suite,
  mapActualStack: (
    stack: string,
    registeredOrigin?: RegistrationOrigin
  ) => CapturedErrorStack[],
  capture?: RunnerSuiteTaskErrorOrigins,
  resolveRegistration?: (error: Error) => RegistrationOrigin | undefined
): ReporterTaskResultProjection {
  const origins = capture?.origins.map((entry) => ({
    ...entry,
    origin: resolveRegistration?.(entry.registrationError),
  }))
  const project: ReporterTaskResultProjection = (
    actualTask,
    capturedResult,
    originalResult
  ) => {
    if (actualTask !== owner) return
    const descriptor =
      capture &&
      originalResult === capture.result &&
      !isCapturedResultProxy(capture.result) &&
      !isCapturedResultProxy(capture.errors)
        ? readCapturedDescriptor(capture.result, 'errors')
        : undefined
    const retained =
      descriptor &&
      'value' in descriptor &&
      descriptor.value === capture?.errors
    projectCapturedErrorStacks(capturedResult, (stack, index) => {
      const entry = retained
        ? origins?.find((item) => item.index === index)
        : undefined
      const slot = entry
        ? readCapturedDescriptor(capture!.errors, index)
        : undefined
      const origin =
        entry && slot && 'value' in slot && slot.value === entry.serializedError
          ? entry.origin
          : undefined
      return mapActualStack(stack, origin)
    })
  }
  if (capture) registerOriginalResultProjection(project)
  return project
}
