import type { Linter } from 'eslint'
// @ts-expect-error - No types for compiled modules.
import { parse, parseForESLint } from 'next/dist/compiled/babel/eslint-parser'
import { version } from '../package.json'

const parser: Linter.Parser = {
  parse,
  parseForESLint,
  meta: {
    name: 'eslint-config-next/parser',
    version,
  },
}

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = parser
