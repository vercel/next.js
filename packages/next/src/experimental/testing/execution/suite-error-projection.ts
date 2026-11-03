import { resolve } from 'node:path'
import { getSourceMappedStackFrames } from '../../../server/patch-error-inspect'
import type { RegistrationOrigin } from './registration-origin'
import type { Suite } from '../runner/tasks'
import type { ReporterTaskResultProjection } from '../reporting/task-updates'

export interface CapturedErrorStack {
  method: string
  file: string
  line: number
  column: number
}

/** The actual host retains its leased artifact while captured stacks are mapped. */
export function createCapturedStackMapper(
  registrationOrigin: (stack: string) => RegistrationOrigin | undefined
): (stack: string) => CapturedErrorStack[] {
  return (stack) => {
    const frames = getSourceMappedStackFrames(stack)
    const helper = frames.findLastIndex((frame) =>
      frame.methodName?.includes('__VITEST_HELPER__')
    )
    const selected = frames.find((frame) => frame.original && !frame.ignored)
    const origin = registrationOrigin(stack)
    return frames.slice(helper + 1).flatMap((frame) => {
      if (frame.ignored || !frame.file || !frame.line1 || !frame.column1)
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
        frame === selected && origin?.location.file === file
          ? origin.location
          : undefined
      return [
        {
          method:
            frame.methodName === '<unknown>' || !frame.methodName
              ? ''
              : frame.methodName,
          file: actualOrigin?.file ?? file,
          line: actualOrigin?.line ?? frame.line1,
          column: actualOrigin?.column ?? frame.column1,
        },
      ]
    })
  }
}

/** Map only the actual received Error records, after normal capture finishes. */
export function createSuiteErrorResultProjection(
  owner: Suite,
  mapActualStack: (stack: string) => CapturedErrorStack[]
): ReporterTaskResultProjection {
  return (actualTask, capturedResult) => {
    if (actualTask !== owner) return
    for (const error of capturedResult?.errors ?? []) {
      if (!error || typeof error !== 'object') continue
      // The pinned host keeps an existing truthy parsed value, including [].
      if ('stacks' in error && error.stacks) continue
      const stack = error.stack || ''
      let frames = typeof stack === 'string' ? mapActualStack(stack) : []
      if (!frames.length) {
        if (
          error.fileName != null &&
          error.lineNumber != null &&
          error.columnNumber != null
        )
          frames = mapActualStack(
            `${error.fileName}:${error.lineNumber}:${error.columnNumber}`
          )
        if (
          error.sourceURL != null &&
          error.line != null &&
          error._column != null
        )
          frames = mapActualStack(
            `${error.sourceURL}:${error.line}:${error._column}`
          )
      }
      error.stacks = frames
    }
  }
}
