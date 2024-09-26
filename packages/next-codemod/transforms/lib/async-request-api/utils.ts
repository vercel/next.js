import type {
  API,
  ASTPath,
  Collection,
  FunctionDeclaration,
  JSCodeshift,
  Node,
} from 'jscodeshift'

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
  node: Node,
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
