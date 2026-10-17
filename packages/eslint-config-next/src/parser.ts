import type { Linter, Scope } from 'eslint'
// @ts-expect-error - No types for compiled modules.
import { parse, parseForESLint } from 'next/dist/compiled/babel/eslint-parser'
import { version } from '../package.json'

type BabelGlobalScope = Scope.Scope & {
  __defineGeneric?(
    name: string,
    set: Map<string, Scope.Variable>,
    variables: Scope.Variable[],
    node: null,
    def: null
  ): void
  implicit?: {
    set: Map<string, Scope.Variable>
    variables: Scope.Variable[]
    left?: Scope.Reference[]
  }
}

type ScopeManager = Scope.ScopeManager & {
  addGlobals?(names: ReadonlyArray<string>): void
}

/**
 * ESLint 10 no longer adds configured and inline (`/* global *\/`) globals to
 * the scope itself. It calls `scopeManager.addGlobals()` instead, which the
 * eslint-scope@5 based scope manager of @babel/eslint-parser@7 doesn't have.
 * This adds it, doing the same scope maintenance ESLint 9 did.
 */
function addGlobalsSupport(scopeManager: ScopeManager) {
  const globalScope = scopeManager.globalScope as BabelGlobalScope | null
  if (!globalScope || typeof globalScope.__defineGeneric !== 'function') return

  scopeManager.addGlobals = (names) => {
    for (const name of names) {
      globalScope.__defineGeneric!(
        name,
        globalScope.set,
        globalScope.variables,
        null,
        null
      )
    }

    // Resolve references to any global variable, not only the added ones:
    // eslint-scope@5 also leaves references to top-level `var` declarations in
    // scripts unresolved, which ESLint 9 resolved here as well.
    globalScope.through = globalScope.through.filter((reference) => {
      const variable = globalScope.set.get(reference.identifier.name)
      if (!variable) return true

      reference.resolved = variable
      variable.references.push(reference)
      return false
    })

    // Assignments to globals in non-strict code aren't implicit globals.
    const { implicit } = globalScope
    if (implicit) {
      implicit.variables = implicit.variables.filter((variable) => {
        if (!globalScope.set.has(variable.name)) return true
        implicit.set.delete(variable.name)
        return false
      })
      implicit.left = implicit.left?.filter(
        (reference) => !globalScope.set.has(reference.identifier.name)
      )
    }
  }
}

const parser: Linter.Parser = {
  parse,
  parseForESLint(code, options) {
    const result: Linter.ESLintParseResult = parseForESLint(code, options)
    const scopeManager: ScopeManager | undefined = result.scopeManager
    if (scopeManager && typeof scopeManager.addGlobals !== 'function') {
      addGlobalsSupport(scopeManager)
    }
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
