import { parse } from 'next/dist/compiled/babel/parser'

/** Native require edges do not pass through the reference instrumenter. */
export function assertIstanbulCjsSource(source: string, file: string) {
  if (!file.endsWith('.cjs')) return
  const syntax = parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: file,
  })
  const pending: unknown[] = [syntax]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      pending.push(...value)
      continue
    }
    const node = value as {
      type?: string
      callee?: {
        type?: string
        name?: string
        object?: { type?: string; name?: string }
        property?: { type?: string; name?: string; value?: unknown }
      }
    }
    if (
      node.type === 'CallExpression' ||
      node.type === 'OptionalCallExpression'
    ) {
      const call = node.callee
      if (
        (call?.type === 'Identifier' && call.name === 'require') ||
        ((call?.type === 'MemberExpression' ||
          call?.type === 'OptionalMemberExpression') &&
          call.object?.type === 'Identifier' &&
          call.object.name === 'module' &&
          (call.property?.name === 'require' ||
            call.property?.value === 'require'))
      )
        throw new Error(
          'Istanbul CommonJS require dependency coverage is not implemented.'
        )
    }
    pending.push(...Object.values(value))
  }
}
