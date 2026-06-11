import type { API, FileInfo, Options } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

// `catchError` and the `retry` error prop dropped their `unstable_` prefix when
// they stabilized. This codemod migrates both:
//
//   1. `unstable_catchError` is a named export of `next/error`, so it is renamed
//      wherever it is imported/required/re-exported from that module (and at its
//      usage sites).
//   2. `unstable_retry` is a framework-injected prop on `error`/`global-error`
//      components. It has no import to anchor on, so the reserved-prefix
//      identifier is renamed wherever it appears.

// Named exports keyed by the module they come from. Extend this when more named
// exports from these modules stabilize.
const IMPORT_RENAMES_BY_SOURCE: Record<string, Record<string, string>> = {
  'next/error': {
    unstable_catchError: 'catchError',
  },
}

// Framework-injected props that stabilized. These are not importable, so they
// are renamed by identifier. The `unstable_` prefix is reserved for Next.js
// APIs, which makes the bare identifier match unambiguous.
const PROP_RENAMES: Record<string, string> = {
  unstable_retry: 'retry',
}

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasChanges = false

  // Renames a stabilized named export across every form it can be imported,
  // re-exported, required, or accessed from `source`.
  function renameImportedApis(
    source: string,
    mapping: Record<string, string>
  ): boolean {
    let changed = false
    const shouldRename = (name: string): boolean => name in mapping

    // Local identifiers that need their usage sites renamed after the
    // import/require binding itself is renamed.
    const identifierRenames: Array<{ oldName: string; newName: string }> = []
    // Variables bound to the whole module: `import * as m`, `const m = require(...)`.
    const moduleVariables = new Set<string>()

    // import { unstable_catchError } from 'next/error'
    root
      .find(j.ImportDeclaration, { source: { value: source } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported?.type === 'Identifier' &&
            shouldRename(specifier.imported.name)
          ) {
            const oldName = specifier.imported.name
            const newName = mapping[oldName]

            if (specifier.local && specifier.local.name === newName) {
              // { unstable_catchError as catchError } -> { catchError }
              const newSpecifier = j.importSpecifier(j.identifier(newName))
              const specifierIndex = path.node.specifiers.indexOf(specifier)
              path.node.specifiers[specifierIndex] = newSpecifier
              identifierRenames.push({ oldName, newName })
            } else {
              specifier.imported = j.identifier(newName)
              if (!specifier.local || specifier.local.name === oldName) {
                identifierRenames.push({ oldName, newName })
              }
            }

            changed = true
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            // import * as nextError from 'next/error'
            moduleVariables.add(specifier.local.name)
          }
        })
      })

    // export { unstable_catchError } from 'next/error'
    root
      .find(j.ExportNamedDeclaration, { source: { value: source } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (
            specifier.type === 'ExportSpecifier' &&
            specifier.local?.type === 'Identifier' &&
            shouldRename(specifier.local.name)
          ) {
            const oldName = specifier.local.name
            const newName = mapping[oldName]

            if (specifier.exported && specifier.exported.name === newName) {
              // export { unstable_catchError as catchError } -> export { catchError }
              // Replace with a fresh shorthand specifier so recast collapses the
              // now-redundant alias instead of printing `catchError as catchError`.
              const specifierIndex = path.node.specifiers.indexOf(specifier)
              path.node.specifiers[specifierIndex] = j.exportSpecifier.from({
                local: j.identifier(newName),
                exported: j.identifier(newName),
              })
            } else {
              specifier.local = j.identifier(newName)
              if (!specifier.exported || specifier.exported.name === oldName) {
                // export { unstable_catchError } -> export { catchError }
                specifier.exported = j.identifier(newName)
              }
              // Otherwise keep a custom alias: { unstable_catchError as myCatch }.
            }

            changed = true
          }
        })
      })

    // const { unstable_catchError } = require('next/error')
    root
      .find(j.CallExpression, { callee: { name: 'require' } })
      .forEach((path) => {
        if (
          path.node.arguments[0]?.type === 'StringLiteral' &&
          path.node.arguments[0].value === source
        ) {
          const parent = path.parent?.node
          if (
            parent?.type === 'VariableDeclarator' &&
            parent.id?.type === 'Identifier'
          ) {
            moduleVariables.add(parent.id.name)
          }

          if (
            parent?.type === 'VariableDeclarator' &&
            parent.id?.type === 'ObjectPattern'
          ) {
            renameObjectPattern(parent.id, mapping, identifierRenames, () => {
              changed = true
            })
          }
        }
      })

    // const { unstable_catchError } = await import('next/error')
    root.find(j.AwaitExpression).forEach((path) => {
      const arg = path.node.argument
      if (
        arg?.type === 'CallExpression' &&
        arg.callee?.type === 'Import' &&
        arg.arguments[0]?.type === 'StringLiteral' &&
        arg.arguments[0].value === source
      ) {
        const parent = path.parent?.node
        if (
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'Identifier'
        ) {
          moduleVariables.add(parent.id.name)
        }

        if (
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'ObjectPattern'
        ) {
          renameObjectPattern(parent.id, mapping, identifierRenames, () => {
            changed = true
          })
        }
      }
    })

    // import('next/error').then(({ unstable_catchError }) => ...)
    root.find(j.CallExpression).forEach((path) => {
      if (
        path.node.callee?.type === 'MemberExpression' &&
        path.node.callee.property?.type === 'Identifier' &&
        path.node.callee.property.name === 'then' &&
        path.node.callee.object?.type === 'CallExpression' &&
        path.node.callee.object.callee?.type === 'Import' &&
        path.node.callee.object.arguments[0]?.type === 'StringLiteral' &&
        path.node.callee.object.arguments[0].value === source &&
        path.node.arguments.length > 0
      ) {
        const callback = path.node.arguments[0]
        let params = null

        if (
          callback.type === 'ArrowFunctionExpression' ||
          callback.type === 'FunctionExpression'
        ) {
          params = callback.params
        }

        if (params && params.length > 0 && params[0].type === 'ObjectPattern') {
          renameObjectPattern(params[0], mapping, identifierRenames, () => {
            changed = true
          })
        }
      }
    })

    // require('next/error').unstable_catchError and nextError.unstable_catchError
    root.find(j.MemberExpression).forEach((path) => {
      const node = path.node

      const isRequireOfSource =
        node.object?.type === 'CallExpression' &&
        node.object.callee?.type === 'Identifier' &&
        node.object.callee.name === 'require' &&
        node.object.arguments[0]?.type === 'StringLiteral' &&
        node.object.arguments[0].value === source

      const isModuleVariable =
        node.object?.type === 'Identifier' &&
        moduleVariables.has(node.object.name)

      if (!isRequireOfSource && !isModuleVariable) {
        return
      }

      if (
        node.computed &&
        node.property?.type === 'StringLiteral' &&
        shouldRename(node.property.value)
      ) {
        node.property = j.stringLiteral(mapping[node.property.value])
        changed = true
      } else if (
        !node.computed &&
        node.property?.type === 'Identifier' &&
        shouldRename(node.property.name)
      ) {
        node.property = j.identifier(mapping[node.property.name])
        changed = true
      }
    })

    // Rename usage sites of locally-bound names, skipping the declarations
    // themselves (those were handled above).
    identifierRenames.forEach(({ oldName, newName }) => {
      root
        .find(j.Identifier, { name: oldName })
        .filter((identifierPath) => {
          const parent = identifierPath.parent
          return !(
            parent.node.type === 'ImportSpecifier' ||
            parent.node.type === 'ExportSpecifier' ||
            (parent.node.type === 'ObjectProperty' &&
              parent.node.key === identifierPath.node) ||
            (parent.node.type === 'VariableDeclarator' &&
              parent.node.id === identifierPath.node) ||
            (parent.node.type === 'FunctionDeclaration' &&
              parent.node.id === identifierPath.node) ||
            (parent.node.type === 'Property' &&
              parent.node.key === identifierPath.node &&
              !parent.node.computed)
          )
        })
        .forEach((identifierPath) => {
          identifierPath.node.name = newName
        })
    })

    return changed
  }

  // Renames keys (and shorthand values) of a destructuring pattern that match
  // the mapping, queuing usage-site renames for renamed bindings.
  function renameObjectPattern(
    objectPattern: any,
    mapping: Record<string, string>,
    identifierRenames: Array<{ oldName: string; newName: string }>,
    onChange: () => void
  ): void {
    objectPattern.properties?.forEach((property: any) => {
      if (
        property.type === 'ObjectProperty' &&
        property.key?.type === 'Identifier' &&
        property.key.name in mapping
      ) {
        const oldName = property.key.name
        const newName = mapping[oldName]

        property.key = j.identifier(newName)

        if (!property.value) {
          property.value = j.identifier(newName)
          identifierRenames.push({ oldName, newName })
        } else if (property.value.type === 'Identifier') {
          const localName = property.value.name
          if (localName === oldName) {
            property.value = j.identifier(newName)
            identifierRenames.push({ oldName, newName })
          } else if (localName === newName) {
            // { unstable_catchError: catchError } -> { catchError }
            property.value = j.identifier(newName)
            property.shorthand = true
            identifierRenames.push({ oldName, newName })
          }
        }

        onChange()
      }
    })
  }

  // Renames a stabilized prop by its (reserved-prefix) identifier everywhere it
  // appears: destructured params, type members, call/usage sites, and member
  // access. Import/export specifiers are skipped so an unrelated same-named
  // import is never broken.
  function renameStabilizedProps(mapping: Record<string, string>): boolean {
    let changed = false

    Object.keys(mapping).forEach((oldName) => {
      const newName = mapping[oldName]

      root.find(j.Identifier, { name: oldName }).forEach((path) => {
        const parentType = path.parent?.node?.type
        if (
          parentType === 'ImportSpecifier' ||
          parentType === 'ImportDefaultSpecifier' ||
          parentType === 'ImportNamespaceSpecifier' ||
          parentType === 'ExportSpecifier'
        ) {
          return
        }
        path.node.name = newName
        changed = true
      })

      // Computed access: props['unstable_retry'] or { ['unstable_retry']: ... }
      root.find(j.StringLiteral, { value: oldName }).forEach((path) => {
        const parent = path.parent?.node
        const isComputedMember =
          parent?.type === 'MemberExpression' &&
          parent.computed &&
          parent.property === path.node
        const isComputedKey =
          (parent?.type === 'ObjectProperty' ||
            parent?.type === 'Property' ||
            parent?.type === 'TSPropertySignature') &&
          parent.computed &&
          parent.key === path.node

        if (isComputedMember || isComputedKey) {
          path.node.value = newName
          changed = true
        }
      })
    })

    return changed
  }

  try {
    for (const source of Object.keys(IMPORT_RENAMES_BY_SOURCE)) {
      if (renameImportedApis(source, IMPORT_RENAMES_BY_SOURCE[source])) {
        hasChanges = true
      }
    }

    if (renameStabilizedProps(PROP_RENAMES)) {
      hasChanges = true
    }

    return hasChanges ? root.toSource(options) : file.source
  } catch (error) {
    console.warn(`Failed to transform ${file.path}: ${error.message}`)
    return file.source
  }
}
