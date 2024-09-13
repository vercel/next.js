import type { API, ASTPath, CallExpression, Collection } from 'jscodeshift'

type AsyncAPIName = 'cookies' | 'headers' | 'draftMode'

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

function isSameNode(childNode, parentNode, j: API['j']) {
  // Start from the child node and move up the AST

  if (!childNode || !parentNode) {
    return false
  }

  if (j(childNode).toSource() === j(parentNode).toSource()) {
    return true
  }

  return false
}

export function transformDynamicAPI(source: string, api: API) {
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false

  function findImportedIdentifier(functionName: AsyncAPIName) {
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
    const importedAlias = findImportedIdentifier(functionName)

    if (!importedAlias) {
      // Skip the transformation if the function is not imported from 'next/headers'
      return
    }

    const defaultExportFunctionPath = root.find(j.ExportDefaultDeclaration, {
      declaration: {
        type: (type) =>
          type === 'FunctionDeclaration' ||
          type === 'FunctionExpression' ||
          type === 'ArrowFunctionExpression',
      },
    })

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

        // Check if available to apply transform
        const closestFunction = j(path).closest(j.FunctionDeclaration)
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
          // Check if current path is under the defaultExportFunction, without using any helper
          const defaultExportFunctionNode = defaultExportFunctionPath.size()
            ? defaultExportFunctionPath.get().node
            : null

          const closestFunctionNode = closestFunction.get().node

          // Determine if defaultExportFunctionNode contains the current path
          const isUnderDefaultExportFunction = defaultExportFunctionNode
            ? isSameNode(
                closestFunctionNode,
                defaultExportFunctionNode.declaration,
                j
              )
            : false

          let canConvertToAsync = false
          // check if current path is under the default export function
          if (isUnderDefaultExportFunction) {
            // if default export function is not async, convert it to async, and await the api call

            if (!isCallAwaited) {
              if (defaultExportFunctionNode.declaration) {
                defaultExportFunctionNode.declaration.async = true
                canConvertToAsync = true
              }
              if (defaultExportFunctionNode.expression) {
                defaultExportFunctionNode.expression.async = true
                canConvertToAsync = true
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
            const parentFunction = j(path).closest(j.FunctionDeclaration)
            const isParentFunctionHook =
              parentFunction.size() > 0 &&
              parentFunction.get().node.id?.name.startsWith('use')
            if (isParentFunctionHook) {
              j(path).replaceWith(
                j.callExpression(j.identifier('use'), [
                  j.callExpression(j.identifier(functionName), []),
                ])
              )
              needsReactUseImport = true
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
