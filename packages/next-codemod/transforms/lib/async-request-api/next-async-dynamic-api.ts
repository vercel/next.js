import type { API, ASTPath, CallExpression, Collection } from 'jscodeshift'
import {
  determineClientDirective,
  isFunctionType,
  isMatchedFunctionExported,
  turnFunctionReturnTypeToAsync,
  insertReactUseImport,
  isFunctionScope,
  findClosetParentFunctionScope,
  wrapParentheseIfNeeded,
  insertCommentOnce,
  NEXTJS_ENTRY_FILES,
  NEXT_CODEMOD_ERROR_PREFIX,
  containsReactHooksCallExpressions,
  isParentUseCallExpression,
  isReactHookName,
} from './utils'
import { createParserFromPath } from '../../../lib/parser'

const DYNAMIC_IMPORT_WARN_COMMENT = ` @next-codemod-error The APIs under 'next/headers' are async now, need to be manually awaited. `

function findDynamicImportsAndComment(root: Collection<any>, j: API['j']) {
  let modified = false
  // find all the dynamic imports of `next/headers`,
  // and add a comment to the import expression to inform this needs to be manually handled

  // find all the dynamic imports of `next/cookies`,
  // Notice, import() is not handled as ImportExpression in current jscodeshift version,
  // we need to use CallExpression to capture the dynamic imports.
  const importPaths = root.find(j.CallExpression, {
    callee: {
      type: 'Import',
    },
    arguments: [{ value: 'next/headers' }],
  })

  importPaths.forEach((path) => {
    const inserted = insertCommentOnce(
      path.node,
      j,
      DYNAMIC_IMPORT_WARN_COMMENT
    )
    modified ||= inserted
  })
  return modified
}

export function transformDynamicAPI(
  source: string,
  _api: API,
  filePath: string
) {
  const isEntryFile = NEXTJS_ENTRY_FILES.test(filePath)
  const j = createParserFromPath(filePath)
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

  function processAsyncApiCalls(
    asyncRequestApiName: string,
    originRequestApiName: string
  ) {
    // Process each call to cookies() or headers()
    root
      .find(j.CallExpression, {
        callee: {
          type: 'Identifier',
          name: asyncRequestApiName,
        },
      })
      .forEach((path) => {
        const isImportedTopLevel = isImportedInModule(path, asyncRequestApiName)
        if (!isImportedTopLevel) {
          return
        }
        let parentFunctionPath = findClosetParentFunctionScope(path, j)
        // We found the parent scope is not a function
        let parentFunctionNode
        if (parentFunctionPath) {
          if (isFunctionScope(parentFunctionPath, j)) {
            parentFunctionNode = parentFunctionPath.node
          } else {
            const scopeNode = parentFunctionPath.node
            if (
              scopeNode.type === 'ReturnStatement' &&
              isFunctionType(scopeNode.argument.type)
            ) {
              parentFunctionNode = scopeNode.argument
            }
          }
        }

        const isAsyncFunction = parentFunctionNode?.async || false

        const isCallAwaited = path.parentPath?.node?.type === 'AwaitExpression'

        const hasChainAccess =
          path.parentPath.value.type === 'MemberExpression' &&
          path.parentPath.value.object === path.node

        const closetScope = j(path).closestScope()
        // For cookies/headers API, only transform server and shared components
        if (isAsyncFunction) {
          if (!isCallAwaited) {
            // Add 'await' in front of cookies() call
            const expr = j.awaitExpression(
              // add parentheses to wrap the function call
              j.callExpression(j.identifier(asyncRequestApiName), [])
            )
            j(path).replaceWith(wrapParentheseIfNeeded(hasChainAccess, j, expr))
            modified = true
          }
        } else {
          // Determine if the function is an export
          const closetScopePath = closetScope.get()
          const isEntryFileExport =
            isEntryFile && isMatchedFunctionExported(closetScopePath, j)
          const closestFunctionNode = closetScope.size()
            ? closetScopePath.node
            : null

          // If it's exporting a function directly, exportFunctionNode is same as exportNode
          // e.g. export default function MyComponent() {}
          // If it's exporting a variable declaration, exportFunctionNode is the function declaration
          // e.g. export const MyComponent = function() {}
          let exportFunctionNode

          if (isEntryFileExport) {
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
          if (isEntryFileExport) {
            // if default export function is not async, convert it to async, and await the api call
            if (!isCallAwaited && isFunctionType(exportFunctionNode.type)) {
              const hasReactHooksUsage = containsReactHooksCallExpressions(
                closetScopePath,
                j
              )
              // If the scoped function is async function
              if (exportFunctionNode.async === false && !hasReactHooksUsage) {
                canConvertToAsync = true
                exportFunctionNode.async = true
              }

              if (canConvertToAsync) {
                const expr = j.awaitExpression(
                  j.callExpression(j.identifier(asyncRequestApiName), [])
                )
                j(path).replaceWith(
                  wrapParentheseIfNeeded(hasChainAccess, j, expr)
                )

                turnFunctionReturnTypeToAsync(closetScopePath.node, j)
                modified = true
              } else {
                // If it's still sync function that cannot be converted to async, wrap the api call with 'use()' if needed
                if (!isParentUseCallExpression(path, j)) {
                  j(path).replaceWith(
                    j.callExpression(j.identifier('use'), [
                      j.callExpression(j.identifier(asyncRequestApiName), []),
                    ])
                  )
                  needsReactUseImport = true
                  modified = true
                }
              }
            }
          } else {
            // if parent is function and it's a hook, which starts with 'use', wrap the api call with 'use()'
            const parentFunction = findClosetParentFunctionScope(path, j)

            if (parentFunction) {
              const parentFunctionName =
                parentFunction.get().node.id?.name || ''
              const isParentFunctionHook = isReactHookName(parentFunctionName)
              if (isParentFunctionHook && !isParentUseCallExpression(path, j)) {
                j(path).replaceWith(
                  j.callExpression(j.identifier('use'), [
                    j.callExpression(j.identifier(asyncRequestApiName), []),
                  ])
                )
                needsReactUseImport = true
              } else {
                const casted = castTypesOrAddComment(
                  j,
                  path,
                  originRequestApiName,
                  root,
                  filePath,
                  insertedTypes,
                  ` ${NEXT_CODEMOD_ERROR_PREFIX} Manually await this call and refactor the function to be async `
                )
                modified ||= casted
              }
            } else {
              const casted = castTypesOrAddComment(
                j,
                path,
                originRequestApiName,
                root,
                filePath,
                insertedTypes,
                ` ${NEXT_CODEMOD_ERROR_PREFIX} please manually await this call, codemod cannot transform due to undetermined async scope `
              )
              modified ||= casted
            }
          }
        }
      })

    // Handle type usage of async API, e.g. `type Cookie = ReturnType<typeof cookies>`
    // convert it to `type Cookie = Awaited<ReturnType<typeof cookies>>`
    root
      .find(j.TSTypeReference, {
        typeName: {
          type: 'Identifier',
          name: 'ReturnType',
        },
      })
      .forEach((path) => {
        const typeParam = path.node.typeParameters?.params[0]

        // Check if the ReturnType is for 'cookies'
        if (
          typeParam &&
          j.TSTypeQuery.check(typeParam) &&
          j.Identifier.check(typeParam.exprName) &&
          typeParam.exprName.name === asyncRequestApiName
        ) {
          // Replace ReturnType<typeof cookies> with Awaited<ReturnType<typeof cookies>>
          const awaitedTypeReference = j.tsTypeReference(
            j.identifier('Awaited'),
            j.tsTypeParameterInstantiation([
              j.tsTypeReference(
                j.identifier('ReturnType'),
                j.tsTypeParameterInstantiation([typeParam])
              ),
            ])
          )

          j(path).replaceWith(awaitedTypeReference)

          modified = true
        }
      })
  }

  const isClientComponent = determineClientDirective(root, j)

  // Only transform the valid calls in server or shared components
  if (isClientComponent) return null

  // Import declaration case, e.g. import { cookies } from 'next/headers'
  const importedNextAsyncRequestApisMapping = findImportMappingFromNextHeaders(
    root,
    j
  )
  for (const originName in importedNextAsyncRequestApisMapping) {
    const aliasName = importedNextAsyncRequestApisMapping[originName]
    processAsyncApiCalls(aliasName, originName)
  }

  // Add import { use } from 'react' if needed and not already imported
  if (needsReactUseImport) {
    insertReactUseImport(root, j)
  }

  const commented = findDynamicImportsAndComment(root, j)
  modified ||= commented

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
  path: ASTPath<CallExpression>,
  originRequestApiName: string,
  root: Collection<any>,
  filePath: string,
  insertedTypes: Set<string>,
  customMessage: string
) {
  let modified = false
  const isTsFile = filePath.endsWith('.ts') || filePath.endsWith('.tsx')
  if (isTsFile) {
    // if the path of call expression is already being awaited, no need to cast
    if (path.parentPath?.node?.type === 'AwaitExpression') return false

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

    const targetType = API_CAST_TYPE_MAP[originRequestApiName]

    const newCastExpression = j.tsAsExpression(
      j.tsAsExpression(path.node, j.tsUnknownKeyword()),
      j.tsTypeReference(j.identifier(targetType))
    )
    // Replace the original expression with the new cast expression,
    // also wrap () around the new cast expression.
    const parent = path.parent.value
    const wrappedExpression = j.parenthesizedExpression(newCastExpression)
    path.replace(wrappedExpression)

    // If the wrapped expression `(<expression>)` is the beginning of an expression statement,
    // add a void operator to separate the statement, to avoid syntax error that being treated as part of previous statement.
    // example:
    // input:
    // <expression>
    // <expression>
    // output:
    // (<expression> as ...)
    // void (<expression> as ...)
    if (
      j.ExpressionStatement.check(parent) &&
      parent.expression === path.node
    ) {
      // append a semicolon to the start of the expression statement
      parent.expression = j.unaryExpression('void', parent.expression)
    }
    modified = true

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
    const inserted = insertCommentOnce(path.node, j, customMessage)
    modified ||= inserted
  }

  return modified
}

function findImportMappingFromNextHeaders(root: Collection<any>, j: API['j']) {
  const mappings = {}

  // Find the import declaration from 'next/headers'
  root
    .find(j.ImportDeclaration, { source: { value: 'next/headers' } })
    .forEach((importPath) => {
      const importDeclaration = importPath.node

      // Iterate over the specifiers and build the mappings
      importDeclaration.specifiers.forEach((specifier) => {
        if (j.ImportSpecifier.check(specifier)) {
          const importedName = specifier.imported.name // Original name (e.g., cookies)
          const localName = specifier.local.name // Local name (e.g., myCookies or same as importedName)

          // Add to the mappings
          mappings[importedName] = localName
        }
      })
    })

  return mappings
}
