import { parse } from 'next/dist/compiled/stacktrace-parser'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  decorateServerError,
  type ErrorSourceType,
} from '../../shared/lib/error-source'

function getFilesystemFrame(frame: StackFrame): StackFrame {
  const f: StackFrame = { ...frame }

  if (typeof f.file === 'string') {
    if (
      // Posix:
      f.file.startsWith('/') ||
      // Win32:
      /^[a-z]:\\/i.test(f.file) ||
      // Win32 UNC:
      f.file.startsWith('\\\\')
    ) {
      f.file = `file://${f.file}`
    }
  }

  return f
}

export function getServerError(error: Error, type: ErrorSourceType): Error {
  if (error.name === 'TurbopackInternalError') {
    // If this is an internal Turbopack error we shouldn't show internal details
    // to the user. These are written to a log file instead.
    const turbopackInternalError = new Error(
      'An unexpected Turbopack error occurred. Please see the output of `next dev` for more details.'
    )
    decorateServerError(turbopackInternalError, type)
    return turbopackInternalError
  }

  let n: Error
  try {
    throw new Error(error.message)
  } catch (e) {
    n = e as Error
  }

  n.name = error.name
  // If present, restore the error code from the original server error.
  const errorCode = (error as any).__NEXT_ERROR_CODE
  if (typeof errorCode === 'string') {
    Object.defineProperty(n, '__NEXT_ERROR_CODE', {
      value: errorCode,
      enumerable: false,
      configurable: true,
    })
  }
  try {
    n.stack = `${n.toString()}\n${parse(error.stack!)
      .map(getFilesystemFrame)
      .map((f) => {
        let str = `    at ${f.methodName}`
        if (f.file) {
          let loc = f.file
          if (f.lineNumber) {
            loc += `:${f.lineNumber}`
            if (f.column) {
              loc += `:${f.column}`
            }
          }
          str += ` (${loc})`
        }
        return str
      })
      .join('\n')}`
  } catch {
    n.stack = error.stack
  }

  decorateServerError(n, type)
  return n
}
