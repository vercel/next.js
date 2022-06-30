import type {
  ArrayExpression,
  BooleanLiteral,
  ExportDeclaration,
  Identifier,
  KeyValueProperty,
  Module,
  Node,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  RegExpLiteral,
  StringLiteral,
  VariableDeclaration,
} from '@swc/core'

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
        return extractValue(decl.init)
      }
    }
  }

  throw new NoSuchDeclarationError()
}

/**
 * A wrapper on top of `extractExportedConstValue` that returns undefined
 * instead of throwing when the thrown error is known.
 */
export function tryToExtractExportedConstValue(
  module: Module,
  exportedName: string
) {
  try {
    return extractExportedConstValue(module, exportedName)
  } catch (error) {
    if (
      error instanceof UnsupportedValueError ||
      error instanceof NoSuchDeclarationError
    ) {
      return undefined
    }
  }
}

function isExportDeclaration(node: Node): node is ExportDeclaration {
  return node.type === 'ExportDeclaration'
}

function isVariableDeclaration(node: Node): node is VariableDeclaration {
  return node.type === 'VariableDeclaration'
}

function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier'
}

function isBooleanLiteral(node: Node): node is BooleanLiteral {
  return node.type === 'BooleanLiteral'
}

function isNullLiteral(node: Node): node is NullLiteral {
  return node.type === 'NullLiteral'
}

function isStringLiteral(node: Node): node is StringLiteral {
  return node.type === 'StringLiteral'
}

function isNumericLiteral(node: Node): node is NumericLiteral {
  return node.type === 'NumericLiteral'
}

function isArrayExpression(node: Node): node is ArrayExpression {
  return node.type === 'ArrayExpression'
}

function isObjectExpression(node: Node): node is ObjectExpression {
  return node.type === 'ObjectExpression'
}

function isKeyValueProperty(node: Node): node is KeyValueProperty {
  return node.type === 'KeyValueProperty'
}

function isRegExpLiteral(node: Node): node is RegExpLiteral {
  return node.type === 'RegExpLiteral'
}

class UnsupportedValueError extends Error {}
class NoSuchDeclarationError extends Error {}

function extractValue(node: Node): any {
  if (isNullLiteral(node)) {
    return null
  } else if (isBooleanLiteral(node)) {
    // e.g. true / false
    return node.value
  } else if (isStringLiteral(node)) {
    // e.g. "abc"
    return node.value
  } else if (isNumericLiteral(node)) {
    // e.g. 123
    return node.value
  } else if (isRegExpLiteral(node)) {
    // e.g. /abc/i
    return new RegExp(node.pattern, node.flags)
  } else if (isIdentifier(node)) {
    switch (node.value) {
      case 'undefined':
        return undefined
      default:
        throw new UnsupportedValueError()
    }
  } else if (isArrayExpression(node)) {
    // e.g. [1, 2, 3]
    const arr = []
    for (const elem of node.elements) {
      if (elem) {
        if (elem.spread) {
          // e.g. [ ...a ]
          throw new UnsupportedValueError()
        }

        arr.push(extractValue(elem.expression))
      } else {
        // e.g. [1, , 2]
        //         ^^
        arr.push(undefined)
      }
    }
    return arr
  } else if (isObjectExpression(node)) {
    // e.g. { a: 1, b: 2 }
    const obj: any = {}
    for (const prop of node.properties) {
      if (!isKeyValueProperty(prop)) {
        // e.g. { ...a }
        throw new UnsupportedValueError()
      }

      let key
      if (isIdentifier(prop.key)) {
        // e.g. { a: 1, b: 2 }
        key = prop.key.value
      } else if (isStringLiteral(prop.key)) {
        // e.g. { "a": 1, "b": 2 }
        key = prop.key.value
      } else {
        throw new UnsupportedValueError()
      }

      obj[key] = extractValue(prop.value)
    }

    return obj
  } else {
    throw new UnsupportedValueError()
  }
}
