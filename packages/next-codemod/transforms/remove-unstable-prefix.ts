import type { API, FileInfo, Options } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

// Mapping of unstable APIs to their stable counterparts
// This can be easily extended when new APIs are stabilized
const UNSTABLE_TO_STABLE_MAPPING: Record<string, string> = {
  unstable_cacheTag: 'cacheTag',
  unstable_cacheLife: 'cacheLife',
}

// Helper function to check if a property name should be renamed
function shouldRenameProperty(propertyName: string): boolean {
  return propertyName in UNSTABLE_TO_STABLE_MAPPING
}

export default function transformer(
  file: FileInfo,
  _api: API,
  options: Options
) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)
  let hasChanges = false

  try {
    // Track identifier renames that need to be applied
    const identifierRenames: Array<{ oldName: string; newName: string }> = []
    // Track variables assigned from next/cache imports/requires
    const cacheVariables = new Set<string>()

    // Handle ES6 imports: import { unstable_cacheTag } from 'next/cache'
    root
      .find(j.ImportDeclaration, { source: { value: 'next/cache' } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported?.type === 'Identifier' &&
            shouldRenameProperty(specifier.imported.name)
          ) {
            const oldName = specifier.imported.name
            const newName = UNSTABLE_TO_STABLE_MAPPING[oldName]

            // Handle alias scenarios
            if (specifier.local && specifier.local.name === newName) {
              // Same alias name: { unstable_cacheTag as cacheTag } -> { cacheTag }
              const newSpecifier = j.importSpecifier(j.identifier(newName))
              const specifierIndex = path.node.specifiers.indexOf(specifier)
              path.node.specifiers[specifierIndex] = newSpecifier
              identifierRenames.push({ oldName, newName })
            } else {
              // Normal case: just update the imported name
              specifier.imported = j.identifier(newName)
              if (!specifier.local || specifier.local.name === oldName) {
                // Not aliased or aliased with old name: add to identifier renames
                identifierRenames.push({ oldName, newName })
              }
            }

            hasChanges = true
          } else if (specifier.type === 'ImportNamespaceSpecifier') {
            // Handle namespace imports: import * as cache from 'next/cache'
            cacheVariables.add(specifier.local.name)
          }
        })
      })

    // Handle export statements: export { unstable_cacheTag } from 'next/cache'
    root
      .find(j.ExportNamedDeclaration, { source: { value: 'next/cache' } })
      .forEach((path) => {
        path.node.specifiers?.forEach((specifier) => {
          if (
            specifier.type === 'ExportSpecifier' &&
            specifier.local?.type === 'Identifier' &&
            shouldRenameProperty(specifier.local.name)
          ) {
            const oldName = specifier.local.name
            const newName = UNSTABLE_TO_STABLE_MAPPING[oldName]

            specifier.local = j.identifier(newName)

            // Handle export alias scenarios
            if (specifier.exported && specifier.exported.name === newName) {
              // Same alias name: { unstable_cacheTag as cacheTag } -> { cacheTag }
              specifier.exported = specifier.local
            } else if (
              !specifier.exported ||
              specifier.exported.name === oldName
            ) {
              // Not aliased or aliased with old name
              specifier.exported = j.identifier(newName)
            }

            hasChanges = true
          }
        })
      })

    // Handle require('next/cache') calls and destructuring
    root
      .find(j.CallExpression, { callee: { name: 'require' } })
      .forEach((path) => {
        if (
          path.node.arguments[0]?.type === 'StringLiteral' &&
          path.node.arguments[0].value === 'next/cache'
        ) {
          // Track variable assignments: const cache = require('next/cache')
          const parent = path.parent?.node
          if (
            parent?.type === 'VariableDeclarator' &&
            parent.id?.type === 'Identifier'
          ) {
            cacheVariables.add(parent.id.name)
          }

          // Handle destructuring: const { unstable_cacheTag } = require('next/cache')
          if (
            parent?.type === 'VariableDeclarator' &&
            parent.id?.type === 'ObjectPattern'
          ) {
            parent.id.properties?.forEach((property) => {
              if (
                property.type === 'ObjectProperty' &&
                property.key?.type === 'Identifier' &&
                shouldRenameProperty(property.key.name)
              ) {
                const oldName = property.key.name
                const newName = UNSTABLE_TO_STABLE_MAPPING[oldName]

                property.key = j.identifier(newName)

                // Handle both shorthand and explicit destructuring
                if (!property.value) {
                  property.value = j.identifier(newName)
                  identifierRenames.push({ oldName, newName })
                } else if (property.value.type === 'Identifier') {
                  const localName = property.value.name
                  if (localName === oldName) {
                    property.value = j.identifier(newName)
                    identifierRenames.push({ oldName, newName })
                  } else if (localName === newName) {
                    // Same alias name: { unstable_cacheTag: cacheTag } -> { cacheTag }
                    property.value = j.identifier(newName)
                    property.shorthand = true
                    identifierRenames.push({ oldName, newName })
                  }
                }

                hasChanges = true
              }
            })
          }
        }
      })

    // Handle await import('next/cache') calls and destructuring
    root.find(j.AwaitExpression).forEach((path) => {
      const arg = path.node.argument
      if (
        arg?.type === 'CallExpression' &&
        arg.callee?.type === 'Import' &&
        arg.arguments[0]?.type === 'StringLiteral' &&
        arg.arguments[0].value === 'next/cache'
      ) {
        // Track variable assignments: const cache = await import('next/cache')
        const parent = path.parent?.node
        if (
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'Identifier'
        ) {
          cacheVariables.add(parent.id.name)
        }

        // Handle destructuring: const { unstable_cacheTag } = await import('next/cache')
        if (
          parent?.type === 'VariableDeclarator' &&
          parent.id?.type === 'ObjectPattern'
        ) {
          parent.id.properties?.forEach((property) => {
            if (
              property.type === 'ObjectProperty' &&
              property.key?.type === 'Identifier' &&
              shouldRenameProperty(property.key.name)
            ) {
              const oldName = property.key.name
              const newName = UNSTABLE_TO_STABLE_MAPPING[oldName]

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
                  // Same alias name: { unstable_cacheTag: cacheTag } -> { cacheTag }
                  property.value = j.identifier(newName)
                  property.shorthand = true
                  identifierRenames.push({ oldName, newName })
                }
              }

              hasChanges = true
            }
          })
        }
      }
    })

    // Handle .then() chains: import('next/cache').then(({ unstable_cacheTag }) => ...)
    root.find(j.CallExpression).forEach((path) => {
      if (
        path.node.callee?.type === 'MemberExpression' &&
        path.node.callee.property?.type === 'Identifier' &&
        path.node.callee.property.name === 'then' &&
        path.node.callee.object?.type === 'CallExpression' &&
        path.node.callee.object.callee?.type === 'Import' &&
        path.node.callee.object.arguments[0]?.type === 'StringLiteral' &&
        path.node.callee.object.arguments[0].value === 'next/cache' &&
        path.node.arguments.length > 0
      ) {
        const callback = path.node.arguments[0]
        let params = null

        if (callback.type === 'ArrowFunctionExpression') {
          params = callback.params
        } else if (callback.type === 'FunctionExpression') {
          params = callback.params
        }

        if (params && params.length > 0 && params[0].type === 'ObjectPattern') {
          params[0].properties?.forEach((property) => {
            if (
              property.type === 'ObjectProperty' &&
              property.key?.type === 'Identifier' &&
              shouldRenameProperty(property.key.name)
            ) {
              const oldName = property.key.name
              const newName = UNSTABLE_TO_STABLE_MAPPING[oldName]

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
                  // Same alias name: { unstable_cacheTag: cacheTag } -> { cacheTag }
                  property.value = j.identifier(newName)
                  property.shorthand = true
                  identifierRenames.push({ oldName, newName })
                }
              }

              hasChanges = true
            }
          })
        }
      }
    })

    // Handle member expressions
    root.find(j.MemberExpression).forEach((path) => {
      const node = path.node

      // Handle direct property access: require('next/cache').unstable_cacheTag
      if (
        node.object?.type === 'CallExpression' &&
        node.object.callee?.type === 'Identifier' &&
        node.object.callee.name === 'require' &&
        node.object.arguments[0]?.type === 'StringLiteral' &&
        node.object.arguments[0].value === 'next/cache'
      ) {
        if (
          node.computed &&
          node.property?.type === 'StringLiteral' &&
          shouldRenameProperty(node.property.value)
        ) {
          const newName = UNSTABLE_TO_STABLE_MAPPING[node.property.value]
          node.property = j.stringLiteral(newName)
          hasChanges = true
        } else if (
          !node.computed &&
          node.property?.type === 'Identifier' &&
          shouldRenameProperty(node.property.name)
        ) {
          const newName = UNSTABLE_TO_STABLE_MAPPING[node.property.name]
          node.property = j.identifier(newName)
          hasChanges = true
        }
      }

      // Handle property access on cache variables: cache.unstable_cacheTag or cache['unstable_cacheTag']
      if (
        node.object?.type === 'Identifier' &&
        cacheVariables.has(node.object.name)
      ) {
        if (
          node.computed &&
          node.property?.type === 'StringLiteral' &&
          shouldRenameProperty(node.property.value)
        ) {
          const newName = UNSTABLE_TO_STABLE_MAPPING[node.property.value]
          node.property = j.stringLiteral(newName)
          hasChanges = true
        } else if (
          !node.computed &&
          node.property?.type === 'Identifier' &&
          shouldRenameProperty(node.property.name)
        ) {
          const newName = UNSTABLE_TO_STABLE_MAPPING[node.property.name]
          node.property = j.identifier(newName)
          hasChanges = true
        }
      }
    })

    // Apply all identifier renames with better scope awareness
    identifierRenames.forEach(({ oldName, newName }) => {
      root
        .find(j.Identifier, { name: oldName })
        .filter((identifierPath) => {
          // Skip renaming declarations themselves
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

    return hasChanges ? root.toSource(options) : file.source
  } catch (error) {
    console.warn(`Failed to transform ${file.path}: ${error.message}`)
    return file.source
  }
}
