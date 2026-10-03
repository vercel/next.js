import type { Scope } from 'eslint'

/**
 * This patch targets Next's bundled @babel/eslint-parser@7.24.6, which uses
 * eslint-scope@5.1.1 through @nicolo-ribaudo/eslint-scope-5-internals@5.1.1-v1.
 * Those dependencies are exactly pinned; this is intentionally not a general
 * scope-manager compatibility layer. The parser's AST is usable by ESLint 10,
 * but its scope manager lacks addGlobals(), which ESLint 10 calls while
 * finalizing SourceCode, before any rules execute. Rule wrappers such as
 * @eslint/compat therefore cannot fix this parser-level failure.
 *
 * ESLint 9 registered configured and inline globals itself. This adapter keeps
 * that behavior available through ESLint 10's new scope-manager interface,
 * preserving Babel parsing rather than switching parsers or requiring Babel 8
 * and its higher Node minimum. A no-op addGlobals() would avoid the exception
 * but leave variables and references inconsistent, producing incorrect results
 * for rules such as no-undef, no-unused-vars, and no-global-assign.
 *
 * __defineGeneric and implicit are Babel's scope internals, not public ESLint
 * APIs. Keep the exact pins and review this file whenever intentionally changing
 * the bundled parser or its scope implementation, even for a patch release.
 * Revalidate test/unit/eslint-config-next/compatibility against both engines;
 * those tests compare this patch with the unmodified parser under ESLint 9.
 * A parser upgrade with native addGlobals() requires explicitly removing this
 * patch after review, rather than silently selecting a different implementation.
 */
type BabelGlobalScope = Scope.Scope & {
  __defineGeneric(
    name: string,
    variablesByName: Map<string, Scope.Variable>,
    variables: Scope.Variable[],
    node: null,
    definition: null
  ): void
  implicit: {
    variables: Scope.Variable[]
    set: Map<string, Scope.Variable>
    left: Scope.Reference[]
  }
}

type BabelScopeManager = Scope.ScopeManager & {
  addGlobals?: (names: string[]) => void
}

export function fixupBabelScope(scopeManager: Scope.ScopeManager): void {
  const manager = scopeManager as BabelScopeManager
  const globalScope = manager.globalScope as BabelGlobalScope | null
  const implicit = globalScope?.implicit
  // The pinned scope implementation always exposes these fields and lacks
  // addGlobals(). Reject a different shape, including native addGlobals(), so
  // an intentional upgrade cannot silently bypass review of this patch.
  if (
    manager.addGlobals !== undefined ||
    !globalScope ||
    typeof globalScope.__defineGeneric !== 'function' ||
    !(globalScope.set instanceof Map) ||
    !Array.isArray(globalScope.variables) ||
    !Array.isArray(globalScope.through) ||
    !implicit ||
    !(implicit.set instanceof Map) ||
    !Array.isArray(implicit.variables) ||
    !Array.isArray(implicit.left)
  ) {
    throw new Error(
      'Unsupported Babel scope manager. Review babel-scope.ts before upgrading the pinned @babel/eslint-parser@7.24.6 / eslint-scope@5.1.1 implementation.'
    )
  }

  // Patch this parse result only, not a shared scope-manager prototype or the
  // bundled Babel module used by Next.js's application compilation pipeline.
  manager.addGlobals = (names) => {
    for (const name of names) {
      // Use Babel's own variable construction and preserve existing bindings.
      // ESLint subsequently assigns writability and inline-comment metadata;
      // this method is responsible only for definitions and reference linking.
      globalScope.__defineGeneric(
        name,
        globalScope.set,
        globalScope.variables,
        null,
        null
      )
    }

    // `through` contains unresolved references. Link references for every known
    // global binding, not only the names passed to addGlobals(): this older scope
    // manager also leaves script-level `var` references unresolved. Resolving
    // only the passed names would introduce false no-undef/no-unused-vars errors.
    globalScope.through = globalScope.through.filter((reference) => {
      const variable = globalScope.set.get(reference.identifier.name)
      if (!variable) return true

      reference.resolved = variable
      variable.references.push(reference)
      return false
    })

    // Assignments to undeclared names in non-strict scripts can create implicit
    // globals. Configured or already-declared bindings must no longer appear
    // in those collections, or no-implicit-globals can report false positives.
    implicit.variables = implicit.variables.filter((variable) => {
      if (!globalScope.set.has(variable.name)) return true
      implicit.set.delete(variable.name)
      return false
    })

    // eslint-scope@5.1.1 always exposes this pending-reference collection. Keep
    // it consistent with the implicit variable array and name map above.
    implicit.left = implicit.left.filter(
      (reference) => !globalScope.set.has(reference.identifier.name)
    )
  }
}
