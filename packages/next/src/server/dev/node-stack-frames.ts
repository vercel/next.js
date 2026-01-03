import { parse } from 'next/dist/compiled/stacktrace-parser'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import path from 'path'
import url from 'url'
import {
  decorateServerError,
  type ErrorSourceType,
} from '../../shared/lib/error-source'
import { normalizeSourceUrl } from '../lib/source-map-utils'

function getFilesystemFrame(frame: StackFrame): StackFrame {
  const f: StackFrame = { ...frame }

  if (typeof f.file === 'string') {
    // Normalize paths that may have been malformed by source-map library
    // (e.g., duplicate path segments from Turbopack)
    f.file = normalizeSourceUrl(f.file)

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

/**
 * Convert a file path to a path relative to the current working directory.
 */
function toRelativePath(filePath: string): string {
  if (filePath.startsWith('file://')) {
    try {
      filePath = url.fileURLToPath(filePath)
    } catch {
      // Invalid file URL, use as-is
    }
  }

  if (path.isAbsolute(filePath)) {
    return path.relative(process.cwd(), filePath)
  }

  return filePath
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
  try {
    n.stack = `${n.toString()}\n${parse(error.stack!)
      .map(getFilesystemFrame)
      .map((f) => {
        let str = `    at ${f.methodName}`
        if (f.file) {
          // Convert to relative path for cleaner output
          let loc = toRelativePath(f.file)
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
