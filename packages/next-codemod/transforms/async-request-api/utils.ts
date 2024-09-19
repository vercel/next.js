import type {
  API,
  ASTPath,
  Collection,
  FunctionDeclaration,
  JSCodeshift,
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
