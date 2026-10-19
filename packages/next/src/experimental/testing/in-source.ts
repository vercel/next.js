import { parse } from 'next/dist/compiled/babel/parser'

type SyntaxNode = { type?: string; [key: string]: unknown }

/** Mirror the native dotted import.meta.vitest AST form; never execute source. */
export function usesInSourceTestMarker(
  source: string,
  filename: string,
  options?: { deferSyntaxError?: boolean }
): boolean {
  let syntax: unknown
  try {
    syntax = parse(source, {
      sourceType: 'unambiguous',
      sourceFilename: filename,
      allowReturnOutsideFunction: true,
      createParenthesizedExpressions: true,
      plugins: [
        ...(/\.[cm]?ts$/.test(filename) ? [] : ['jsx' as const]),
        'decorators-legacy',
        ...(/\.[cm]?tsx?$/.test(filename) ? ['typescript' as const] : []),
      ],
    })
  } catch (error) {
    // Already-selected test files still reach the compiler/static collector,
    // which owns their original syntax diagnostics. Source-only discovery must
    // fail here because it cannot safely decide whether to select the file.
    if (options?.deferSyntaxError) return false
    throw new Error(`Cannot determine in-source test marker in ${filename}`, {
      cause: error,
    })
  }
  let found = false
  const pending: unknown[] = [syntax]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    const node = value as SyntaxNode
    if (node.type === 'MemberExpression' && node.computed === false) {
      const object = node.object as SyntaxNode | undefined
      const property = node.property as SyntaxNode | undefined
      if (
        object?.type === 'MetaProperty' &&
        (object.meta as SyntaxNode | undefined)?.name === 'import' &&
        (object.property as SyntaxNode | undefined)?.name === 'meta' &&
        property?.type === 'Identifier' &&
        property.name === 'vitest'
      ) {
        found = true
        continue
      }
    }
    // SWC's substitution requires a direct MetaProp object. Keep wrappers
    // visible and reject them rather than erasing syntax before negotiation.
    if (
      (node.type === 'MemberExpression' ||
        node.type === 'OptionalMemberExpression') &&
      node.computed === false &&
      (node.property as SyntaxNode | undefined)?.name === 'vitest'
    ) {
      const wrappers: unknown[] = [node.object]
      while (wrappers.length) {
        const wrapperValue = wrappers.pop()
        if (!wrapperValue || typeof wrapperValue !== 'object') continue
        const object = wrapperValue as SyntaxNode
        if (
          object.type === 'MetaProperty' &&
          (object.meta as SyntaxNode | undefined)?.name === 'import' &&
          (object.property as SyntaxNode | undefined)?.name === 'meta'
        )
          throw new Error(
            `Wrapped or optional import.meta.vitest access remains unqualified in ${filename}`
          )
        // Inspect only object wrappers, not unrelated enclosing expressions.
        if (
          [
            'ParenthesizedExpression',
            'TSAsExpression',
            'TSTypeAssertion',
            'TSNonNullExpression',
            'TSSatisfiesExpression',
            'TypeCastExpression',
          ].includes(object.type ?? '')
        ) {
          wrappers.push(object.expression)
        }
      }
    }
    pending.push(...Object.values(node))
  }
  return found
}
