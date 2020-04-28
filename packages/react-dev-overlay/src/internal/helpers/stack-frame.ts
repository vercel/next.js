import { StackFrame } from 'stacktrace-parser'

export function createOriginalStackFrame(
  source: StackFrame,
  file: string | null,
  lineNumber: number | null,
  column: number | null
): StackFrame {
  const o = { ...source }
  if (file) {
    o.file = file
    o.lineNumber = lineNumber
    o.column = column
  }
  return o
}

export function getFrameSource(frame: StackFrame): string {
  let str = ''
  try {
    const u = new URL(frame.file)

    // Strip the origin for same-origin scripts.
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.location?.origin !== u.origin
    ) {
      str += u.origin
    }

    // Strip query string information as it's typically too verbose to be
    // meaningful.
    str += u.pathname
    str += ' '
  } catch {
    str += (frame.file || '(unknown)') + ' '
  }

  if (frame.lineNumber != null) {
    if (frame.column != null) {
      str += `(${frame.lineNumber}:${frame.column}) `
    } else {
      str += `(${frame.lineNumber}) `
    }
  }
  return str.slice(0, -1)
}
