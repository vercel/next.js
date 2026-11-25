/**
 * The tiny expression language used inside a `// @gate` pragma.
 *
 * ```
 * expression → binary ( ( "||" | "&&" ) binary )* ;
 * binary     → unary ( ( "==" | "!=" | "===" | "!==" ) unary )* ;
 * unary      → "!" unary | primary ;
 * primary    → NAME | STRING | BOOLEAN | "(" expression ")" ;
 * ```
 *
 * This mirrors the grammar React uses for its own `@gate` pragmas
 * (`scripts/babel/transform-test-gate-pragma.js` in facebook/react), so
 * pragmas read the same in both repos:
 *
 * ```
 * // @gate !dev
 * // @gate mode === 'start' && !cacheComponents
 * ```
 *
 * `NAME` is a condition declared in `./conditions.ts`. Unlike React, the
 * expression is parsed at *runtime* rather than compiled by the transform,
 * which keeps the source rewrite trivial and lets the runtime report the
 * pragma text verbatim in error messages.
 */

export type ExprNode =
  | { type: 'literal'; value: string | boolean }
  | { type: 'condition'; name: string }
  | { type: 'not'; argument: ExprNode }
  | { type: 'logical'; op: '&&' | '||'; left: ExprNode; right: ExprNode }
  | { type: 'compare'; op: '=='; left: ExprNode; right: ExprNode }
  | { type: 'compare'; op: '!='; left: ExprNode; right: ExprNode }

export type ParsedExpression = {
  node: ExprNode
  /** Every condition name referenced by the expression, deduplicated. */
  names: string[]
}

type Token =
  | { type: 'name'; name: string }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: '&&' | '||' | '==' | '!=' | '!' | '(' | ')' }

const NAME_RE = /[a-zA-Z_$][0-9a-zA-Z_$]*/y

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const char = source[i]

    if (char === '"' || char === "'") {
      let value = ''
      i++
      while (i < source.length && source[i] !== char) value += source[i++]
      if (source[i] !== char) {
        throw new SyntaxError(
          `Unterminated string in \`${source}\` (missing closing ${char}).`
        )
      }
      i++
      tokens.push({ type: 'string', value })
      continue
    }

    if (/\s/.test(char)) {
      i++
      continue
    }

    const next3 = source.slice(i, i + 3)
    if (next3 === '===') {
      tokens.push({ type: '==' })
      i += 3
      continue
    }
    if (next3 === '!==') {
      tokens.push({ type: '!=' })
      i += 3
      continue
    }

    const next2 = source.slice(i, i + 2)
    if (next2 === '&&' || next2 === '||' || next2 === '==' || next2 === '!=') {
      tokens.push({ type: next2 })
      i += 2
      continue
    }

    if (char === '(' || char === ')' || char === '!') {
      tokens.push({ type: char })
      i++
      continue
    }

    NAME_RE.lastIndex = i
    const match = NAME_RE.exec(source)
    if (match) {
      const name = match[0]
      if (name === 'true' || name === 'false') {
        tokens.push({ type: 'boolean', value: name === 'true' })
      } else {
        tokens.push({ type: 'name', name })
      }
      i += name.length
      continue
    }

    throw new SyntaxError(
      `Unexpected character ${JSON.stringify(char)} in \`${source}\`.`
    )
  }
  return tokens
}

/** Parses a pragma condition, collecting the condition names it references. */
export function parse(source: string): ParsedExpression {
  const tokens = tokenize(source)
  const names = new Set<string>()
  let i = 0

  function expression(): ExprNode {
    let left = binary()
    for (;;) {
      const token = tokens[i]
      if (token && (token.type === '&&' || token.type === '||')) {
        i++
        left = { type: 'logical', op: token.type, left, right: binary() }
        continue
      }
      return left
    }
  }

  function binary(): ExprNode {
    let left = unary()
    for (;;) {
      const token = tokens[i]
      if (token && (token.type === '==' || token.type === '!=')) {
        i++
        left = { type: 'compare', op: token.type, left, right: unary() }
        continue
      }
      return left
    }
  }

  function unary(): ExprNode {
    if (tokens[i]?.type === '!') {
      i++
      return { type: 'not', argument: unary() }
    }
    return primary()
  }

  function primary(): ExprNode {
    const token = tokens[i]
    if (!token) {
      throw new SyntaxError(`Unexpected end of expression in \`${source}\`.`)
    }
    switch (token.type) {
      case 'boolean':
      case 'string':
        i++
        return { type: 'literal', value: token.value }
      case 'name':
        i++
        names.add(token.name)
        return { type: 'condition', name: token.name }
      case '(': {
        i++
        const inner = expression()
        if (tokens[i]?.type !== ')') {
          throw new SyntaxError(`Missing closing \`)\` in \`${source}\`.`)
        }
        i++
        return inner
      }
      default:
        throw new SyntaxError(`Unexpected \`${token.type}\` in \`${source}\`.`)
    }
  }

  const node = expression()
  if (i !== tokens.length) {
    throw new SyntaxError(
      `Unexpected \`${tokens[i].type}\` after a complete expression in ` +
        `\`${source}\`.`
    )
  }
  return { node, names: [...names] }
}

function evaluateNode(
  node: ExprNode,
  read: (name: string) => unknown
): unknown {
  switch (node.type) {
    case 'literal':
      return node.value
    case 'condition':
      return read(node.name)
    case 'not':
      return !evaluateNode(node.argument, read)
    case 'logical':
      return node.op === '&&'
        ? evaluateNode(node.left, read) && evaluateNode(node.right, read)
        : evaluateNode(node.left, read) || evaluateNode(node.right, read)
    case 'compare': {
      const left = evaluateNode(node.left, read)
      const right = evaluateNode(node.right, read)
      return node.op === '==' ? left === right : left !== right
    }
    default:
      throw new Error(`Unknown @gate expression node: ${JSON.stringify(node)}`)
  }
}

/**
 * Evaluates a parsed expression. Condition values are coerced by truthiness in
 * boolean position, so `@gate prefetchInlining` works for a condition whose
 * value is `false | {maxSize: number}`, and `@gate output === 'export'` works
 * for string-valued conditions.
 */
export function evaluate(
  node: ExprNode,
  read: (name: string) => unknown
): boolean {
  return Boolean(evaluateNode(node, read))
}
