import { parse } from 'next/dist/compiled/babel/parser'
import type { SerializedDiagnostic } from '../reporting/events'
import type { createClientSourceMapResolver } from './source-maps'

type Frame = { file: string; line: number; column: number; method?: string }
type SyntaxNode = {
  type?: string
  start?: number
  end?: number
  loc?: { start: { line: number; column: number } }
  [key: string]: unknown
}

/** Native generator callers can point at the callee inside its original await. */
function awaitedHelperCaller(source: string, frame: Frame): Frame {
  let lineStart = 0
  const newline = /\r\n|[\n\r\u2028\u2029]/g
  for (let line = 1; line < frame.line; line++) {
    const next = newline.exec(source)
    if (!next) return frame
    lineStart = next.index + next[0].length
  }
  const lineEnd = newline.exec(source)?.index ?? source.length
  const offset = lineStart + frame.column - 1
  if (offset > lineEnd) return frame
  let syntax: unknown
  try {
    syntax = parse(source, {
      sourceType: 'unambiguous',
      sourceFilename: frame.file,
      allowReturnOutsideFunction: true,
      createParenthesizedExpressions: true,
      plugins: [
        ...(/\.[cm]?ts$/.test(frame.file) ? [] : ['jsx' as const]),
        'decorators-legacy',
        ...(/\.[cm]?tsx?$/.test(frame.file) ? ['typescript' as const] : []),
      ],
    })
  } catch {
    return frame
  }
  let selected: SyntaxNode | undefined
  let width = Infinity
  const pending: unknown[] = [syntax]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    const node = value as SyntaxNode
    if (
      typeof node.start === 'number' &&
      typeof node.end === 'number' &&
      (offset < node.start || offset > node.end)
    )
      continue
    if (node.type === 'AwaitExpression') {
      const argument = node.argument as SyntaxNode | undefined
      const callee = argument?.callee as SyntaxNode | undefined
      if (
        argument?.type === 'CallExpression' &&
        callee &&
        typeof callee.start === 'number' &&
        typeof callee.end === 'number' &&
        offset >= callee.start &&
        offset <= callee.end &&
        node.loc &&
        typeof node.start === 'number' &&
        typeof node.end === 'number' &&
        node.end - node.start < width
      ) {
        selected = node
        width = node.end - node.start
      }
    }
    pending.push(...Object.values(node))
  }
  return selected?.loc
    ? {
        ...frame,
        line: selected.loc.start.line,
        column: selected.loc.start.column + 1,
      }
    : frame
}

/** Presentation only: preserve the original Browser error and its raw stack. */
export function mapClientDiagnosticStack(
  stack: string,
  mapper: Pick<
    ReturnType<typeof createClientSourceMapResolver>,
    'mapLocation' | 'getSourceContent'
  >
): NonNullable<SerializedDiagnostic['frames']> {
  const raw = stack.split('\n').flatMap((line) => {
    const match =
      /(https?:\/\/[^\s)]+(?: line [1-9]\d* > srcScript)?):(\d+):(\d+)\)?$/.exec(
        line
      )
    if (!match) return []
    const method = line.slice(0, match.index)
    return [
      {
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        helper: /^\s*at\s/.test(method) && method.includes('__VITEST_HELPER__'),
      },
    ]
  })
  // The helper's framework frame may not have a selected user-source mapping.
  const helperIndex = raw.findLastIndex((frame) => frame.helper)
  let helperCaller = helperIndex >= 0
  return raw.slice(helperIndex + 1).flatMap((frame) => {
    try {
      let mapped = mapper.mapLocation(frame)
      if (helperCaller) {
        helperCaller = false
        try {
          const source = mapper.getSourceContent(frame)
          if (source !== null) mapped = awaitedHelperCaller(source, mapped)
        } catch {
          // Missing retained content must not discard an otherwise mapped caller.
        }
      }
      return [
        {
          file: mapped.file,
          line: mapped.line,
          column: mapped.column,
          methodName: mapped.method,
          original: true,
        },
      ]
    } catch {
      return []
    }
  })
}
