import { parse } from 'next/dist/compiled/stacktrace-parser'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  decorateServerError,
  type ErrorSourceType,
} from '../../../../shared/lib/error-source'
import isError from '../../../../lib/is-error'

export function getFilesystemFrame(frame: StackFrame): StackFrame {
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

// If there's a cause of the error, will keep the new error message
// but with the original stack trace.
function decorateErrorWithCause(error: Error): Error {
  let message = error.message
  let stack = error.stack
  let curr: any = error
  while (curr && isError(curr) && curr.cause) {
    const cause = curr.cause
    if (isError(cause)) {
      if (cause.stack) {
        // Append the stack trace of the cause to the current error
        stack = `${stack}\nCaused by: ${cause.stack}`
      }
    }
    curr = cause
  }
  // Override the error message if there's new information
  if (error.message !== message) {
    error.message = message
  }
  if (error.stack !== stack) {
    error.stack = stack
  }
  return error
}

export function getServerError(err: Error, type: ErrorSourceType): Error {
  const error = decorateErrorWithCause(err)

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
  try {
    n.stack = `${n.toString()}\n${parse(error.stack || '')
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
