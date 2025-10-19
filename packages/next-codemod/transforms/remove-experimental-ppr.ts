import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

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

  // Remove export const experimental_ppr = boolean
  const directExports = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [
        {
          id: { name: 'experimental_ppr' },
        },
      ],
    },
  })

  if (directExports.size() > 0) {
    directExports.remove()
    hasChanges = true
  }

  // Remove const experimental_ppr = boolean declarations
  const variableDeclarations = root.find(j.VariableDeclaration).filter((path) =>
    path.node.declarations.some((decl) => {
      if (j.VariableDeclarator.check(decl) && j.Identifier.check(decl.id)) {
        return decl.id.name === 'experimental_ppr'
      }
      return false
    })
  )

  if (variableDeclarations.size() > 0) {
    variableDeclarations.remove()
    hasChanges = true
  }

  // Handle export { experimental_ppr } and export { experimental_ppr, other }
  const namedExports = root
    .find(j.ExportNamedDeclaration)
    .filter((path) => path.node.specifiers && path.node.specifiers.length > 0)

  namedExports.forEach((path) => {
    const specifiers = path.node.specifiers
    if (!specifiers) return

    const filteredSpecifiers = specifiers.filter((spec) => {
      if (j.ExportSpecifier.check(spec) && j.Identifier.check(spec.local)) {
        return spec.local.name !== 'experimental_ppr'
      }
      return true
    })

    // If we removed any specifiers
    if (filteredSpecifiers.length !== specifiers.length) {
      hasChanges = true

      // If no specifiers left, remove the entire export statement
      if (filteredSpecifiers.length === 0) {
        j(path).remove()
      } else {
        // Update the specifiers array
        path.node.specifiers = filteredSpecifiers
      }
    }
  })

  if (hasChanges) {
    return root.toSource()
  }

  return file.source
}
