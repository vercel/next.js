import { parse } from 'next/dist/compiled/stacktrace-parser'

const regexNextStatic = /\/_next(\/static\/.+)/

export interface StackFrame {
  file: string | null
  methodName: string
  arguments: string[]
  /** 1-based */
  line1: number | null
  /** 1-based */
  column1: number | null
}

export function parseStack(
  stack: string,
  distDir = process.env.__NEXT_DIST_DIR
): StackFrame[] {
  if (!stack) return []

  // throw away eval information that stacktrace-parser doesn't support
  // adapted from https://github.com/stacktracejs/error-stack-parser/blob/9f33c224b5d7b607755eb277f9d51fcdb7287e24/error-stack-parser.js#L59C33-L59C62
  stack = stack
    .split('\n')
    .map((line) => {
      if (line.includes('(eval ')) {
        line = line
          .replace(/eval code/g, 'eval')
          .replace(/\(eval at [^()]* \(/, '(file://')
          .replace(/\),.*$/g, ')')
      }

      return line
    })
    .join('\n')

  const frames = parse(stack)
  return frames.map((frame) => {
    try {
      const url = new URL(frame.file!)
      const res = regexNextStatic.exec(url.pathname)
      if (res) {
        const effectiveDistDir = distDir
          ?.replace(/\\/g, '/')
          ?.replace(/\/$/, '')
        if (effectiveDistDir) {
          frame.file =
            'file://' + effectiveDistDir.concat(res.pop()!) + url.search
        }
      }
    } catch {}
    return {
      file: frame.file,
      line1: frame.lineNumber,
      column1: frame.column,
      methodName: frame.methodName,
      arguments: frame.arguments,
    }
  })
}
