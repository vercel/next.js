import { parse, StackFrame } from 'stacktrace-parser'

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

const symbolError = Symbol('NextjsError')

export function getErrorSource(error: Error): 'server' | 'edge-server' | null {
  return (error as any)[symbolError] || null
}

export function getServerError(
  error: Error,
  type: 'edge-server' | 'server'
): Error {
  let n: Error
  try {
    throw new Error(error.message)
  } catch (e) {
    n = e as Error
  }

  n.name = error.name
  try {
    n.stack = parse(error.stack!)
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
      .join('\n')
  } catch {
    n.stack = error.stack
  }

  Object.defineProperty(n, symbolError, {
    writable: false,
    enumerable: false,
    configurable: false,
    value: type,
  })
  return n
}
