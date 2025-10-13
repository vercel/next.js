import type { Linter } from 'eslint'

const {
  parse,
  parseForESLint,
  // No types for compiled modules.
  // eslint-disable-next-line @next/internal/typechecked-require
} = require('next/dist/compiled/babel/eslint-parser')
const { version } = require('../package.json')

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
