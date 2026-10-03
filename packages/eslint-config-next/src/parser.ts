import type { Linter } from 'eslint'
// @ts-expect-error - No types for compiled modules.
import { parse, parseForESLint } from 'next/dist/compiled/babel/eslint-parser'
import { version } from '../package.json'
import { fixupBabelScope } from './babel-scope'

const parser: Linter.Parser = {
  parse,
  parseForESLint(code, options) {
    // Keep Next's exactly pinned @babel/eslint-parser@7.24.6 bundle, its options,
    // AST, services, and visitor keys unchanged. Intentional parser upgrades must
    // review babel-scope.ts; this patch does not support arbitrary Babel releases.
    // Adapt only the scope-manager interface before ESLint 10
    // finalizes the result and registers globals; ESLint 9 can use the same
    // result without calling the added method. This changes linting only, not
    // how Next.js compiles the application's JavaScript or Babel-specific syntax.
    const result: Linter.ESLintParseResult = parseForESLint(code, options)
    if (result.scopeManager) fixupBabelScope(result.scopeManager)
    return result
  },
  meta: {
    name: 'eslint-config-next/parser',
    version,
  },
}

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = parser
