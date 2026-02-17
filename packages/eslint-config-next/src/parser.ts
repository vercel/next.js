import type { Linter } from 'eslint'
// @ts-expect-error - No types for compiled modules.
import { parse, parseForESLint } from 'next/dist/compiled/babel/eslint-parser'
import { version } from '../package.json'

/**
 * Polyfill `scopeManager.addGlobals()` for ESLint 10 compatibility.
 *
 * ESLint 10 requires scope managers to implement `addGlobals(names)` (added in
 * eslint-scope 9.1.0). The compiled `@babel/eslint-parser` bundled in Next.js
 * uses eslint-scope v5.x which lacks this method.
 *
 * Can be removed once `@babel/eslint-parser` is upgraded to a version with
 * native eslint-scope 9+ support.
 */
function patchScopeManager(scopeManager: any): void {
  if (!scopeManager || typeof scopeManager.addGlobals === 'function') {
    return
  }

  scopeManager.addGlobals = function addGlobals(names: Iterable<string>): void {
    const globalScope = this.globalScope
    if (!globalScope) {
      return
    }

    for (const name of names) {
      // Skip if already defined
      if (globalScope.set.has(name)) {
        continue
      }

      // Create a Variable-like object
      const variable: {
        name: string
        identifiers: any[]
        references: any[]
        defs: any[]
        scope: any
        eslintUsed: boolean
      } = {
        name,
        identifiers: [],
        references: [],
        defs: [],
        scope: globalScope,
        eslintUsed: true,
      }

      globalScope.set.set(name, variable)
      globalScope.variables.push(variable)

      // Resolve any unresolved references that match this name
      const newThrough: any[] = []
      for (const ref of globalScope.through) {
        if (ref.identifier.name === name) {
          variable.references.push(ref)
          ref.resolved = variable
        } else {
          newThrough.push(ref)
        }
      }
      globalScope.through = newThrough
    }
  }
}

function patchedParseForESLint(
  ...args: Parameters<typeof parseForESLint>
): ReturnType<typeof parseForESLint> {
  const result = parseForESLint(...args)
  patchScopeManager(result.scopeManager)
  return result
}

const parser: Linter.Parser = {
  parse,
  parseForESLint: patchedParseForESLint,
  meta: {
    name: 'eslint-config-next/parser',
    version,
  },
}

// Use `export =` instead of `export default` for ESLint parser compatibility.
// ESLint expects parser modules to be directly importable as CommonJS modules (module.exports).
export = parser
