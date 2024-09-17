import type {
  API,
  ASTPath,
  CallExpression,
  Collection,
  FunctionDeclaration,
} from 'jscodeshift'

type AsyncAPIName = 'cookies' | 'headers' | 'draftMode'

function isFunctionType(type: string) {
  return (
    type === 'FunctionDeclaration' ||
    type === 'FunctionExpression' ||
    type === 'ArrowFunctionExpression'
  )
}

function insertReactUseImport(root: Collection<any>, j: API['j']) {
  const hasReactUseImport =
    root
      .find(j.ImportSpecifier, {
        imported: {
          type: 'Identifier',
          name: 'use',
        },
      })
      .size() > 0

  if (!hasReactUseImport) {
    const reactImportDeclaration = root.find(j.ImportDeclaration, {
      source: {
        type: 'Literal',
        value: 'react',
      },
    })

    if (reactImportDeclaration.size() > 0) {
      // Add 'use' to existing 'react' import declaration
      reactImportDeclaration
        .get()
        .node.specifiers.push(j.importSpecifier(j.identifier('use')))
    } else {
      // Create new import declaration for 'use' from 'react'
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('use'))],
        j.literal('react')
      )

      // append after "use client" directive if there's any
      const clientDirectives = root.find(j.Literal, { value: 'use client' })
      if (clientDirectives.size() > 0) {
        const parent = clientDirectives.get().parentPath
        if (parent) {
          parent.insertAfter(newImport)
        } else {
          if (root.length > 0) {
            root.at(0).insertAfter(newImport)
          } else {
            root.get().node.program.body.unshift(newImport)
          }
        }
      } else {
        root.get().node.program.body.unshift(newImport)
      }
    }
  }
}

function isMatchedFunctionExported(
  path: ASTPath<FunctionDeclaration>,
  j: API['jscodeshift']
): boolean {
  const GENERATE_METADATA_FUNCTION_NAME = 'generateMetadata'
  // Check for direct export (`export function generateMetadata() {}`)
  const directMetadataAPIExport = j(path).closest(j.ExportNamedDeclaration, {
    declaration: {
      type: 'FunctionDeclaration',
      id: {
        name: GENERATE_METADATA_FUNCTION_NAME,
      },
    },
  })

  if (directMetadataAPIExport.size() > 0) {
    return true
  }

  // Check for default export (`export default function() {}`)
  const isDefaultExport = j(path).closest(j.ExportDefaultDeclaration).size() > 0
  if (isDefaultExport) {
    return true
  }

  // Look for named export elsewhere in the file (`export { generateMetadata }`)
  const root = j(path).closestScope().closest(j.Program)
  const isNamedExport =
    root
      .find(j.ExportNamedDeclaration, {
        specifiers: [
          {
            type: 'ExportSpecifier',
            exported: {
              name: GENERATE_METADATA_FUNCTION_NAME,
            },
          },
        ],
      })
      .size() > 0

  // Look for variable export but still function, e.g. `export const generateMetadata = function() {}`,
  // also check if variable is a function or arrow function
  const isVariableExport =
    root
      .find(j.ExportNamedDeclaration, {
        declaration: {
          declarations: [
            {
              type: 'VariableDeclarator',
              id: {
                type: 'Identifier',
                name: GENERATE_METADATA_FUNCTION_NAME,
              },
              init: {
                type: isFunctionType,
              },
            },
          ],
        },
      })
      .size() > 0

  if (isVariableExport) return true

  return isNamedExport
}

function findImportedIdentifier(
  root: Collection<any>,
  j: API['j'],
  functionName: AsyncAPIName
) {
  let importedAlias: string | undefined
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/headers' },
    })
    .find(j.ImportSpecifier, {
      imported: { name: functionName },
    })
    .forEach((importSpecifier) => {
      importedAlias = importSpecifier.node.local.name
    })
  return importedAlias
}

export function transformDynamicAPI(source: string, api: API) {
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function isImportedInModule(
    path: ASTPath<CallExpression>,
    functionName: string
  ) {
    const closestDef = j(path)
      .closestScope()
      .findVariableDeclarators(functionName)
    return closestDef.size() === 0
  }

  function processAsyncApiCalls(functionName: AsyncAPIName) {
    const importedAlias = findImportedIdentifier(root, j, functionName)

    if (!importedAlias) {
      // Skip the transformation if the function is not imported from 'next/headers'
      return
    }

    // Process each call to cookies() or headers()
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: functionName,
        },
      })
      .forEach((path) => {
        const isImportedTopLevel = isImportedInModule(path, importedAlias)
        if (!isImportedTopLevel) {
          return
        }

        const closetScope = j(path).closestScope()

        // Check if available to apply transform
        const closestFunction =
          j(path).closest(j.FunctionDeclaration) ||
          j(path).closest(j.FunctionExpression) ||
          j(path).closest(j.ArrowFunctionExpression) ||
          j(path).closest(j.VariableDeclaration)

        const isAsyncFunction = closestFunction
          .nodes()
          .some((node) => node.async)

        const isCallAwaited = j(path).closest(j.AwaitExpression).size() > 0

        // For cookies/headers API, only transform server and shared components
        if (isAsyncFunction) {
          if (!isCallAwaited) {
            // Add 'await' in front of cookies() call
            j(path).replaceWith(
              j.awaitExpression(
                j.callExpression(j.identifier(functionName), [])
              )
            )
          }
        } else {
          // Determine if the function is an export
          const isFromExport = isMatchedFunctionExported(closetScope.get(), j)
          const closestFunctionNode = closetScope.size()
            ? closetScope.get().node
            : null

          // If it's exporting a function directly, exportFunctionNode is same as exportNode
          // e.g. export default function MyComponent() {}
          // If it's exporting a variable declaration, exportFunctionNode is the function declaration
          // e.g. export const MyComponent = function() {}
          let exportFunctionNode

          if (isFromExport) {
            if (
              closestFunctionNode &&
              isFunctionType(closestFunctionNode.type)
            ) {
              exportFunctionNode = closestFunctionNode
            }
          } else {
            // Is normal async function
            exportFunctionNode = closestFunctionNode
          }

          let canConvertToAsync = false
          // check if current path is under the default export function
          if (isFromExport) {
            // if default export function is not async, convert it to async, and await the api call
            if (!isCallAwaited) {
              // If the scoped function is async function
              if (
                isFunctionType(exportFunctionNode.type) &&
                exportFunctionNode.async === false
              ) {
                canConvertToAsync = true
                exportFunctionNode.async = true
              }

              if (canConvertToAsync) {
                j(path).replaceWith(
                  j.awaitExpression(
                    j.callExpression(j.identifier(functionName), [])
                  )
                )
              }
            }
          } else {
            // if parent is function function and it's a hook, which starts with 'use', wrap the api call with 'use()'
            const parentFunction =
              j(path).closest(j.FunctionDeclaration) ||
              j(path).closest(j.FunctionExpression) ||
              j(path).closest(j.ArrowFunctionExpression)

            if (parentFunction.size() > 0) {
              const parentFUnctionName = parentFunction.get().node.id?.name
              const isParentFunctionHook = parentFUnctionName?.startsWith('use')
              if (isParentFunctionHook) {
                j(path).replaceWith(
                  j.callExpression(j.identifier('use'), [
                    j.callExpression(j.identifier(functionName), []),
                  ])
                )
                needsReactUseImport = true
              }
            } else {
              // TODO: Otherwise, leave a message to the user to manually handle the transformation
            }
          }
        }
      })
  }

  const isClientComponent = isClientComponentAst(j, root)

  // Only transform the valid calls in server or shared components
  if (!isClientComponent) {
    processAsyncApiCalls('cookies')
    processAsyncApiCalls('headers')
    processAsyncApiCalls('draftMode')

    // Add import { use } from 'react' if needed and not already imported
    if (needsReactUseImport) {
      insertReactUseImport(root, j)
    }
  }

  return root.toSource()
}

// TODO: fix detection of client component
function isClientComponentAst(j: API['j'], root: Collection<any>) {
  // 'use client' without `;` at the end
  const hasStringDirective =
    root
      .find(j.Literal)
      .filter((path) => {
        const expr = path.node

        return (
          expr.value === 'use client' && path.parentPath.node.type === 'Program'
        )
      })
      .size() > 0

  // 'use client';
  const hasStringDirectiveWithSemicolon =
    root
      .find(j.StringLiteral)
      .filter((path) => {
        const expr = path.node
        return (
          expr.type === 'StringLiteral' &&
          expr.value === 'use client' &&
          path.parentPath.node.type === 'Program'
        )
      })
      .size() > 0

  return hasStringDirective || hasStringDirectiveWithSemicolon
}
