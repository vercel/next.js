import { Parser as AcornParser } from 'next/dist/compiled/acorn'
import { importAssertions } from 'acorn-import-assertions'
const parser = AcornParser.extend(importAssertions)

const defaultParserOptions = {
  ranges: true,
  locations: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
  // https://github.com/tc39/proposal-hashbang
  allowHashBang: true,
  onComment: null,
}

export function parseModuleWebpackAST(
  sourceType: string | undefined,
  source: any
) {
  const type = sourceType ? sourceType : 'module'

  const parserOptions = {
    ...defaultParserOptions,
    allowReturnOutsideFunction: type === 'script',
    // ...options,
    sourceType: type === 'auto' ? 'module' : type,
  }

  return parser.parse(source, parserOptions)
}
