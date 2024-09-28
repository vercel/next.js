import type {
  API,
  ArrowFunctionExpression,
  ASTPath,
  Collection,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  JSCodeshift,
} from 'jscodeshift'

export type FunctionScope =
  | FunctionDeclaration
  | FunctionExpression
  | ArrowFunctionExpression

export const TARGET_NAMED_EXPORTS = new Set([
  // For custom route
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  // For page and layout
  'generateMetadata',
])

export const TARGET_PROP_NAMES = new Set(['params', 'searchParams'])

export function isFunctionType(
  type: string
): type is
  | 'FunctionDeclaration'
  | 'FunctionExpression'
  | 'ArrowFunctionExpression' {
  return (
    type === 'FunctionDeclaration' ||
    type === 'FunctionExpression' ||
    type === 'ArrowFunctionExpression'
  )
}

export function isMatchedFunctionExported(
  path: ASTPath<FunctionDeclaration>,
  j: API['jscodeshift']
): boolean {
  const matchedFunctionNameFilter = (idName) => TARGET_NAMED_EXPORTS.has(idName)

  const directNamedExport = j(path).closest(j.ExportNamedDeclaration, {
    declaration: {
      type: 'FunctionDeclaration',
      id: {
        name: matchedFunctionNameFilter,
      },
    },
  })

  if (directNamedExport.size() > 0) {
    return true
  }

  // Check for default export (`export default function() {}`)
  const isDefaultExport = j(path).closest(j.ExportDefaultDeclaration).size() > 0
  if (isDefaultExport) {
    return true
  }

  // Look for named export elsewhere in the file (`export { <named> }`)
  const root = j(path).closestScope().closest(j.Program)
  const isNamedExport =
    root
      .find(j.ExportNamedDeclaration, {
        specifiers: [
          {
            type: 'ExportSpecifier',
            exported: {
              name: matchedFunctionNameFilter,
            },
          },
        ],
      })
      .size() > 0

  // Look for variable export but still function, e.g. `export const <named> = function() {}`,
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
                name: matchedFunctionNameFilter,
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

export function determineClientDirective(
  root: Collection<any>,
  j: JSCodeshift,
  source: string
) {
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

  if (hasStringDirective || hasStringDirectiveWithSemicolon) return true

  // Since the client detection is not reliable with AST in jscodeshift,
  // determine if 'use client' or "use client" is leading in the source code.
  const trimmedSource = source.trim()
  const containsClientDirective =
    /^'use client'/.test(trimmedSource) || /^"use client"/g.test(trimmedSource)

  return containsClientDirective
}

export function isPromiseType(typeAnnotation) {
  return (
    typeAnnotation.type === 'TSTypeReference' &&
    typeAnnotation.typeName.name === 'Promise'
  )
}

export function turnFunctionReturnTypeToAsync(
  node: any,
  j: API['jscodeshift']
) {
  if (
    j.FunctionDeclaration.check(node) ||
    j.FunctionExpression.check(node) ||
    j.ArrowFunctionExpression.check(node)
  ) {
    if (node.returnType) {
      const returnTypeAnnotation = node.returnType.typeAnnotation
      const isReturnTypePromise = isPromiseType(returnTypeAnnotation)
      // Turn <return type> to Promise<return type>
      // e.g. () => { slug: string } to () => Promise<{ slug: string }>
      // e.g. Anything to Promise<Anything>
      if (!isReturnTypePromise) {
        if (
          node.returnType &&
          j.TSTypeAnnotation.check(node.returnType) &&
          (j.TSTypeReference.check(node.returnType.typeAnnotation) ||
            j.TSUnionType.check(node.returnType.typeAnnotation) ||
            j.TSTypePredicate.check(node.returnType.typeAnnotation))
        ) {
          // Change the return type to Promise<void>
          node.returnType.typeAnnotation = j.tsTypeReference(
            j.identifier('Promise'),
            // @ts-ignore ignore the super strict type checking on the type annotation
            j.tsTypeParameterInstantiation([returnTypeAnnotation])
          )
        }
      }
    }
  }
}

export function insertReactUseImport(root: Collection<any>, j: API['j']) {
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
      // Final all type imports to 'react'

      const reactImport = root.find(j.ImportDeclaration, {
        source: {
          type: 'Literal',
          value: 'react',
        },
      })

      if (reactImport.size() > 0) {
        reactImport
          .get()
          .node.specifiers.push(j.importSpecifier(j.identifier('use')))
      } else {
        // Add new import declaration for 'react' and 'use'
        root
          .get()
          .node.program.body.unshift(
            j.importDeclaration(
              [j.importSpecifier(j.identifier('use'))],
              j.literal('react')
            )
          )
      }
    }
  }
}

function findSubScopeArgumentIdentifier(
  path: ASTPath<any>,
  j: API['j'],
  argName: string
) {
  const defCount = j(path).find(j.Identifier, { name: argName }).size()

  return defCount > 0
}

export function generateUniqueIdentifier(
  defaultIdName: string,
  path: ASTPath<any>,
  j: API['j']
): ReturnType<typeof j.identifier> {
  let idName = defaultIdName
  let idNameSuffix = 0
  while (findSubScopeArgumentIdentifier(path, j, idName)) {
    idName = defaultIdName + idNameSuffix
    idNameSuffix++
  }

  const propsIdentifier = j.identifier(idName)
  return propsIdentifier
}

export function isFunctionScope(
  path: ASTPath,
  j: API['jscodeshift']
): path is ASTPath<FunctionScope> {
  if (!path) return false
  const node = path.node

  // Check if the node is a function (declaration, expression, or arrow function)
  return (
    j.FunctionDeclaration.check(node) ||
    j.FunctionExpression.check(node) ||
    j.ArrowFunctionExpression.check(node)
  )
}

export function findClosetParentFunctionScope(
  path: ASTPath,
  j: API['jscodeshift']
) {
  let parentFunctionPath = path.scope.path
  while (parentFunctionPath && !isFunctionScope(parentFunctionPath, j)) {
    parentFunctionPath = parentFunctionPath.parent
  }

  return parentFunctionPath
}

function getFunctionNodeFromBinding(
  bindingPath: ASTPath<any>,
  idName: string,
  j: API['jscodeshift'],
  root: Collection<any>
): ASTPath<FunctionScope> | undefined {
  const bindingNode = bindingPath.node
  if (
    j.FunctionDeclaration.check(bindingNode) ||
    j.FunctionExpression.check(bindingNode) ||
    j.ArrowFunctionExpression.check(bindingNode)
  ) {
    return bindingPath
  } else if (j.VariableDeclarator.check(bindingNode)) {
    const init = bindingNode.init
    // If the initializer is a function (arrow or function expression), record it
    if (
      j.FunctionExpression.check(init) ||
      j.ArrowFunctionExpression.check(init)
    ) {
      return bindingPath.get('init')
    }
  } else if (j.Identifier.check(bindingNode)) {
    const variablePath = root.find(j.VariableDeclaration, {
      // declarations, each is VariableDeclarator
      declarations: [
        {
          // VariableDeclarator
          type: 'VariableDeclarator',
          // id is Identifier
          id: {
            type: 'Identifier',
            name: idName,
          },
        },
      ],
    })

    if (variablePath.size()) {
      const variableDeclarator = variablePath.get()?.node?.declarations?.[0]
      if (j.VariableDeclarator.check(variableDeclarator)) {
        const init = variableDeclarator.init
        if (
          j.FunctionExpression.check(init) ||
          j.ArrowFunctionExpression.check(init)
        ) {
          return variablePath.get('declarations', 0, 'init')
        }
      }
    }

    const functionDeclarations = root.find(j.FunctionDeclaration, {
      id: {
        name: idName,
      },
    })
    if (functionDeclarations.size()) {
      return functionDeclarations.get()
    }
  }
  return undefined
}

export function getFunctionPathFromExportPath(
  exportPath: ASTPath<ExportDefaultDeclaration | ExportNamedDeclaration>,
  j: API['jscodeshift'],
  root: Collection<any>,
  namedExportFilter: (idName: string) => boolean
): ASTPath<FunctionScope> | undefined {
  // Default export
  if (j.ExportDefaultDeclaration.check(exportPath.node)) {
    const { declaration } = exportPath.node
    if (declaration) {
      if (
        j.FunctionDeclaration.check(declaration) ||
        j.FunctionExpression.check(declaration) ||
        j.ArrowFunctionExpression.check(declaration)
      ) {
        return exportPath.get('declaration')
      } else if (j.Identifier.check(declaration)) {
        const idName = declaration.name
        if (!namedExportFilter(idName)) return

        const exportBinding = exportPath.scope.getBindings()[idName]?.[0]
        if (exportBinding) {
          return getFunctionNodeFromBinding(exportBinding, idName, j, root)
        }
      }
    }
  } else if (
    // Named exports
    j.ExportNamedDeclaration.check(exportPath.node)
  ) {
    const namedExportPath = exportPath as ASTPath<ExportNamedDeclaration>
    // extract the named exports, name specifiers, and default specifiers
    const { declaration, specifiers } = namedExportPath.node
    if (declaration) {
      if (j.VariableDeclaration.check(declaration)) {
        const { declarations } = declaration
        for (const decl of declarations) {
          if (j.VariableDeclarator.check(decl) && j.Identifier.check(decl.id)) {
            const idName = decl.id.name

            if (!namedExportFilter(idName)) return

            // get bindings for each variable declarator
            const exportBinding =
              namedExportPath.scope.getBindings()[idName]?.[0]
            if (exportBinding) {
              return getFunctionNodeFromBinding(exportBinding, idName, j, root)
            }
          }
        }
      } else if (
        j.FunctionDeclaration.check(declaration) ||
        j.FunctionExpression.check(declaration) ||
        j.ArrowFunctionExpression.check(declaration)
      ) {
        const funcName = declaration.id?.name
        if (!namedExportFilter(funcName)) return

        return namedExportPath.get('declaration')
      }
    }
    if (specifiers) {
      for (const specifier of specifiers) {
        if (j.ExportSpecifier.check(specifier)) {
          const idName = specifier.local.name

          if (!namedExportFilter(idName)) return

          const exportBinding = namedExportPath.scope.getBindings()[idName]?.[0]
          if (exportBinding) {
            return getFunctionNodeFromBinding(exportBinding, idName, j, root)
          }
        }
      }
    }
  }

  return undefined
}

export function wrapParentheseIfNeeded(
  hasChainAccess: boolean,
  j: API['jscodeshift'],
  expression
) {
  return hasChainAccess ? j.parenthesizedExpression(expression) : expression
}

export function insertCommentOnce(
  path: ASTPath<any>,
  j: API['j'],
  comment: string
) {
  if (path.node.comments) {
    const hasComment = path.node.comments.some(
      (commentNode) => commentNode.value === comment
    )
    if (hasComment) {
      return
    }
  }
  path.node.comments = [j.commentBlock(comment), ...(path.node.comments || [])]
}
