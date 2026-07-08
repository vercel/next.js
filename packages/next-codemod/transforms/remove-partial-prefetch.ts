import type { API, FileInfo, JSCodeshift } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

// Route Segment Config name and the only value this codemod strips.
const CONFIG_NAME = 'prefetch'
const TARGET_VALUE = 'partial'

// Unwrap `'partial' as const` / `'partial' satisfies T` so the value guard
// still matches when the export is annotated.
function unwrap(j: JSCodeshift, node: any) {
  if (
    (j.TSAsExpression && j.TSAsExpression.check(node)) ||
    (j.TSSatisfiesExpression && j.TSSatisfiesExpression.check(node))
  ) {
    return node.expression
  }
  return node
}

// Only `prefetch = 'partial'` matches. A different value such as
// `prefetch = 'allow-runtime'` is a legitimate config and is left untouched.
function isTargetPrefetch(j: JSCodeshift, decl: any): boolean {
  if (!j.VariableDeclarator.check(decl) || !j.Identifier.check(decl.id)) {
    return false
  }
  if (decl.id.name !== CONFIG_NAME || !decl.init) {
    return false
  }
  const init = unwrap(j, decl.init)
  return (
    (j.StringLiteral.check(init) && init.value === TARGET_VALUE) ||
    (j.Literal.check(init) && init.value === TARGET_VALUE)
  )
}

export default function transformer(file: FileInfo, _api: API) {
  // Run on App Router page/layout/route files, except for test environment.
  if (
    process.env.NODE_ENV !== 'test' &&
    !/[/\\]app[/\\](?:.*[/\\])?(page|layout|route)(\.[^/\\]*)?$/.test(file.path)
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  let hasChanges = false

  // Remove `export const prefetch = 'partial'`
  const directExports = root
    .find(j.ExportNamedDeclaration, {
      declaration: { type: 'VariableDeclaration' },
    })
    .filter((path) => {
      const declaration = path.node.declaration
      if (!j.VariableDeclaration.check(declaration)) {
        return false
      }
      return declaration.declarations.some((decl) => isTargetPrefetch(j, decl))
    })

  if (directExports.size() > 0) {
    directExports.remove()
    hasChanges = true
  }

  // Remove bare `const prefetch = 'partial'` declarations (paired with
  // `export { prefetch }`). Track that we removed it so we only drop the
  // matching export specifier below.
  let removedBareDeclaration = false
  const variableDeclarations = root
    .find(j.VariableDeclaration)
    .filter((path) => {
      // `export const prefetch` is handled above; skip it here.
      if (j.ExportNamedDeclaration.check(path.parent.node)) {
        return false
      }
      return path.node.declarations.some((decl) => isTargetPrefetch(j, decl))
    })

  if (variableDeclarations.size() > 0) {
    variableDeclarations.remove()
    removedBareDeclaration = true
    hasChanges = true
  }

  // Handle `export { prefetch }` and `export { prefetch, other }`, but only
  // when the paired declaration was the `'partial'` one we removed above.
  if (removedBareDeclaration) {
    const namedExports = root
      .find(j.ExportNamedDeclaration)
      .filter((path) => Boolean(path.node.specifiers?.length))

    namedExports.forEach((path) => {
      const specifiers = path.node.specifiers
      if (!specifiers) return

      const filteredSpecifiers = specifiers.filter((spec) => {
        if (j.ExportSpecifier.check(spec) && j.Identifier.check(spec.local)) {
          return spec.local.name !== CONFIG_NAME
        }
        return true
      })

      if (filteredSpecifiers.length !== specifiers.length) {
        hasChanges = true

        if (filteredSpecifiers.length === 0) {
          j(path).remove()
        } else {
          path.node.specifiers = filteredSpecifiers
        }
      }
    })
  }

  if (hasChanges) {
    return root.toSource()
  }

  return file.source
}
