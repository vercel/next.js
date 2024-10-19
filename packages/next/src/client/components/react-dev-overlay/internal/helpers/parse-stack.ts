import { parse } from 'next/dist/compiled/stacktrace-parser'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  getHydrationErrorStackInfo,
  isReactHydrationErrorMessage,
} from '../../../is-hydration-error'

const regexNextStatic = /\/_next(\/static\/.+)/

export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return []
  const messageAndStack = stack.replace(/^Error: /, '')
  if (isReactHydrationErrorMessage(messageAndStack)) {
    const { stack: parsedStack } = getHydrationErrorStackInfo(messageAndStack)
    if (parsedStack) {
      stack = parsedStack
    }
  }

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
        const distDir = process.env.__NEXT_DIST_DIR
          ?.replace(/\\/g, '/')
          ?.replace(/\/$/, '')
        if (distDir) {
          frame.file = 'file://' + distDir.concat(res.pop()!) + url.search
        }
      }
    } catch {}
    return frame
  })
}
