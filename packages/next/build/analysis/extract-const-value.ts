import type { Module } from '@swc/core'
import {
  extractValue,
  isExportDeclaration,
  isIdentifier,
  isVariableDeclaration,
  NoSuchDeclarationError,
} from './shared'

/**
 * Extracts the value of an exported const variable named `exportedName`
 * (e.g. "export const config = { runtime: 'experimental-edge' }") from swc's AST.
 * The value must be one of (or throws UnsupportedValueError):
 *   - string
 *   - boolean
 *   - number
 *   - null
 *   - undefined
 *   - array containing values listed in this list
 *   - object containing values listed in this list
 *
 * Throws NoSuchDeclarationError if the declaration is not found.
 */
export function extractExportedConstValue(
  module: Module,
  exportedName: string
): any {
  for (const moduleItem of module.body) {
    if (!isExportDeclaration(moduleItem)) {
      continue
    }

    const declaration = moduleItem.declaration
    if (!isVariableDeclaration(declaration)) {
      continue
    }

    if (declaration.kind !== 'const') {
      continue
    }

    for (const decl of declaration.declarations) {
      if (
        isIdentifier(decl.id) &&
        decl.id.value === exportedName &&
        decl.init
      ) {
        return extractValue(decl.init, [exportedName])
      }
    }
  }

  throw new NoSuchDeclarationError()
}
