import type { TestArtifactLocation } from '../runner/tasks'

type SyntaxToken = {
  type?: { label?: string } | string
  start: number
  end: number
  loc?: { start: { line: number; column: number } }
}

type SyntaxNode = {
  type?: string
  start?: number
  end?: number
  loc?: { start: { line: number; column: number } }
  [key: string]: unknown
}

/** Match only measured ordinary callee forms; other mapped points stay unchanged. */
export function mapArtifactCallLocation(
  source: string,
  filename: string,
  location: TestArtifactLocation,
  parseSource: (source: string, filename: string) => unknown
): TestArtifactLocation {
  if (
    !Number.isSafeInteger(location.line) ||
    !Number.isSafeInteger(location.column) ||
    location.line < 1 ||
    location.column < 1
  )
    return location
  let lineStart = 0
  const newline = /\r\n|[\n\r\u2028\u2029]/g
  for (let line = 1; line < location.line; line++) {
    const next = newline.exec(source)
    if (!next) return location
    lineStart = next.index + next[0].length
  }
  const lineEnd = newline.exec(source)?.index ?? source.length
  const offset = lineStart + location.column - 1
  if (offset > lineEnd) return location
  let syntax: unknown
  try {
    syntax = parseSource(source, filename)
  } catch {
    return location
  }
  const tokens = (syntax as { tokens?: SyntaxToken[] }).tokens ?? []
  const label = (token: SyntaxToken | undefined) =>
    typeof token?.type === 'object' ? token.type?.label : undefined
  let selected: SyntaxNode | undefined
  let selectedWidth = Infinity
  const pending: unknown[] = [syntax]
  const chainCalls = new WeakSet<SyntaxNode>()
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    const node = value as SyntaxNode
    if (node.type === 'ChainExpression') {
      let segment = node.expression as SyntaxNode | undefined
      while (
        segment?.type === 'CallExpression' ||
        segment?.type === 'MemberExpression'
      ) {
        if (segment.type === 'CallExpression') chainCalls.add(segment)
        segment = (
          segment.type === 'CallExpression' ? segment.callee : segment.object
        ) as SyntaxNode | undefined
      }
    }
    if (
      typeof node.start === 'number' &&
      typeof node.end === 'number' &&
      (offset < node.start || offset > node.end)
    )
      continue
    if (
      (node.type === 'OptionalCallExpression' || chainCalls.has(node)) &&
      node.optional === true
    ) {
      const callee = node.callee as SyntaxNode | undefined
      const index = tokens.findIndex(
        (token) => token.start === callee?.end && label(token) === '?.'
      )
      const operator = tokens[index]
      const open = tokens[index + 1]
      if (
        operator &&
        offset >= operator.start &&
        offset < operator.end &&
        label(open) === '(' &&
        open.loc
      )
        return {
          ...location,
          line: open.loc.start.line,
          column: open.loc.start.column + 1,
        }
    }
    if (node.type === 'CallExpression' && !chainCalls.has(node)) {
      const callee = node.callee as SyntaxNode | undefined
      // The native call point can be exactly callee.end, at the opening parenthesis.
      if (
        callee &&
        typeof callee.start === 'number' &&
        typeof callee.end === 'number' &&
        offset >= callee.start &&
        offset <= callee.end
      ) {
        let target = callee
        while (target.type === 'ParenthesizedExpression')
          target = target.expression as SyntaxNode
        if (target.type === 'MemberExpression' && target.computed === false)
          target = target.property as SyntaxNode
        if (
          target.type === 'Identifier' &&
          target.loc &&
          callee.end - callee.start < selectedWidth
        ) {
          selected = target
          selectedWidth = callee.end - callee.start
        }
      }
    }
    for (const [key, child] of Object.entries(node))
      if (key !== 'tokens') pending.push(child)
  }
  return selected?.loc
    ? {
        ...location,
        line: selected.loc.start.line,
        column: selected.loc.start.column + 1,
      }
    : location
}
