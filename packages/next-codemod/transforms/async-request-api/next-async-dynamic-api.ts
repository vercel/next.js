import type { API, ASTPath, CallExpression, Collection } from 'jscodeshift'
import {
  determineClientDirective,
  isFunctionType,
  isMatchedFunctionExported,
  turnFunctionReturnTypeToAsync,
  insertReactUseImport,
} from './utils'

type AsyncAPIName = 'cookies' | 'headers' | 'draftMode'

function wrapParathnessIfNeeded(
  hasChainAccess: boolean,
  j: API['jscodeshift'],
  expression
) {
  return hasChainAccess ? j.parenthesizedExpression(expression) : expression
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
      imported: {
        name: functionName,
      },
    })
    .forEach((importSpecifier) => {
      importedAlias = importSpecifier.node.local.name
    })
  return importedAlias
}

export function transformDynamicAPI(
  source: string,
  api: API,
  filePath: string
) {
  const j = api.jscodeshift.withParser('tsx')
  const root = j(source)
  let modified = false

  // Check if 'use' from 'react' needs to be imported
  let needsReactUseImport = false
  const insertedTypes = new Set<string>()

  function isImportedInModule(
    path: ASTPath<CallExpression>,
    functionName: string
  ) {
    const closestDef = j(path)
      .closestScope()
      .findVariableDeclarators(functionName)
    return closestDef.size() === 0
  }

  function processAsyncApiCalls(asyncRequestApiName: AsyncAPIName) {
    const importedAlias = findImportedIdentifier(root, j, asyncRequestApiName)

    if (!importedAlias) {
      // Skip the transformation if the function is not imported from 'next/headers'
      return
    }

    // Process each call to cookies() or headers()
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: asyncRequestApiName,
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

        const isCallAwaited = path.parentPath?.node?.type === 'AwaitExpression'

        const hasChainAccess =
          path.parentPath.value.type === 'MemberExpression' &&
          path.parentPath.value.object === path.node

        // For cookies/headers API, only transform server and shared components
        if (isAsyncFunction) {
          if (!isCallAwaited) {
            // Add 'await' in front of cookies() call
            const expr = j.awaitExpression(
              // add parentheses to wrap the function call
              j.callExpression(j.identifier(asyncRequestApiName), [])
            )
            j(path).replaceWith(wrapParathnessIfNeeded(hasChainAccess, j, expr))
            modified = true
          }
        } else {
          // Determine if the function is an export
          const closetScopePath = closetScope.get()
          const isFromExport = isMatchedFunctionExported(closetScopePath, j)
          const closestFunctionNode = closetScope.size()
            ? closetScopePath.node
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
                const expr = j.awaitExpression(
                  j.callExpression(j.identifier(asyncRequestApiName), [])
                )
                j(path).replaceWith(
                  wrapParathnessIfNeeded(hasChainAccess, j, expr)
                )

                turnFunctionReturnTypeToAsync(closetScopePath.node, j)

                modified = true
              }
            }
          } else {
            // if parent is function and it's a hook, which starts with 'use', wrap the api call with 'use()'
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
                    j.callExpression(j.identifier(asyncRequestApiName), []),
                  ])
                )
                needsReactUseImport = true
              } else {
                castTypesOrAddComment(
                  j,
                  path,
                  asyncRequestApiName,
                  root,
                  filePath,
                  insertedTypes
                )
              }
            } else {
              castTypesOrAddComment(
                j,
                path,
                asyncRequestApiName,
                root,
                filePath,
                insertedTypes
              )
            }
            modified = true
          }
        }
      })
  }

  const isClientComponent = determineClientDirective(root, j, source)

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

  return modified ? root.toSource() : null
}

// cast to unknown first, then the specific type
const API_CAST_TYPE_MAP = {
  cookies: 'UnsafeUnwrappedCookies',
  headers: 'UnsafeUnwrappedHeaders',
  draftMode: 'UnsafeUnwrappedDraftMode',
}

function castTypesOrAddComment(
  j: API['jscodeshift'],
  path: ASTPath<any>,
  asyncRequestApiName: string,
  root: Collection<any>,
  filePath: string,
  insertedTypes: Set<string>
) {
  const isTsFile = filePath.endsWith('.ts') || filePath.endsWith('.tsx')
  if (isTsFile) {
    /* Do type cast for headers, cookies, draftMode
      import {
        type UnsafeUnwrappedHeaders,
        type UnsafeUnwrappedCookies,
        type UnsafeUnwrappedDraftMode
      } from 'next/headers'
      
      cookies() as unknown as UnsafeUnwrappedCookies
      headers() as unknown as UnsafeUnwrappedHeaders
      draftMode() as unknown as UnsafeUnwrappedDraftMode
      
      e.g. `<path>` is cookies(), convert it to `(<path> as unknown as UnsafeUnwrappedCookies)`
    */

    const targetType = API_CAST_TYPE_MAP[asyncRequestApiName]

    const newCastExpression = j.tsAsExpression(
      j.tsAsExpression(path.node, j.tsUnknownKeyword()),
      j.tsTypeReference(j.identifier(targetType))
    )
    // Replace the original expression with the new cast expression,
    // also wrap () around the new cast expression.
    j(path).replaceWith(j.parenthesizedExpression(newCastExpression))

    // If cast types are not imported, add them to the import list
    const importDeclaration = root.find(j.ImportDeclaration, {
      source: { value: 'next/headers' },
    })
    if (importDeclaration.size() > 0) {
      const hasImportedType =
        importDeclaration
          .find(j.TSTypeAliasDeclaration, {
            id: { name: targetType },
          })
          .size() > 0 ||
        importDeclaration
          .find(j.ImportSpecifier, {
            imported: { name: targetType },
          })
          .size() > 0

      if (!hasImportedType && !insertedTypes.has(targetType)) {
        importDeclaration
          .get()
          .node.specifiers.push(
            j.importSpecifier(j.identifier(`type ${targetType}`))
          )
        insertedTypes.add(targetType)
      }
    }
  } else {
    // Otherwise for JS file, leave a message to the user to manually handle the transformation
    path.node.comments = [
      j.commentBlock(
        ' TODO: await this async call and propagate the async correctly '
      ),
      ...(path.node.comments || []),
    ]
  }
}
