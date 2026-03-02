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
  TemplateLiteral,
  TsSatisfiesExpression,
  VariableDeclaration,
} from '@swc/core'

export class NoSuchDeclarationError extends Error {}

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

function isTemplateLiteral(node: Node): node is TemplateLiteral {
  return node.type === 'TemplateLiteral'
}

function isTsSatisfiesExpression(node: Node): node is TsSatisfiesExpression {
  return node.type === 'TsSatisfiesExpression'
}

export class UnsupportedValueError extends Error {
  /** @example `config.runtime[0].value` */
  path?: string

  constructor(message: string, paths?: string[]) {
    super(message)

    // Generating "path" that looks like "config.runtime[0].value"
    let codePath: string | undefined
    if (paths) {
      codePath = ''
      for (const path of paths) {
        if (path[0] === '[') {
          // "array" + "[0]"
          codePath += path
        } else {
          if (codePath === '') {
            codePath = path
          } else {
            // "object" + ".key"
            codePath += `.${path}`
          }
        }
      }
    }

    this.path = codePath
  }
}

function extractValue(node: Node, path?: string[]): any {
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
        throw new UnsupportedValueError(
          `Unknown identifier "${node.value}"`,
          path
        )
    }
  } else if (isArrayExpression(node)) {
    // e.g. [1, 2, 3]
    const arr = []
    for (let i = 0, len = node.elements.length; i < len; i++) {
      const elem = node.elements[i]
      if (elem) {
        if (elem.spread) {
          // e.g. [ ...a ]
          throw new UnsupportedValueError(
            'Unsupported spread operator in the Array Expression',
            path
          )
        }

        arr.push(extractValue(elem.expression, path && [...path, `[${i}]`]))
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
        throw new UnsupportedValueError(
          'Unsupported spread operator in the Object Expression',
          path
        )
      }

      let key
      if (isIdentifier(prop.key)) {
        // e.g. { a: 1, b: 2 }
        key = prop.key.value
      } else if (isStringLiteral(prop.key)) {
        // e.g. { "a": 1, "b": 2 }
        key = prop.key.value
      } else {
        throw new UnsupportedValueError(
          `Unsupported key type "${prop.key.type}" in the Object Expression`,
          path
        )
      }

      obj[key] = extractValue(prop.value, path && [...path, key])
    }

    return obj
  } else if (isTemplateLiteral(node)) {
    // e.g. `abc`
    if (node.expressions.length !== 0) {
      // TODO: should we add support for `${'e'}d${'g'}'e'`?
      throw new UnsupportedValueError(
        'Unsupported template literal with expressions',
        path
      )
    }

    // When TemplateLiteral has 0 expressions, the length of quasis is always 1.
    // Because when parsing TemplateLiteral, the parser yields the first quasi,
    // then the first expression, then the next quasi, then the next expression, etc.,
    // until the last quasi.
    // Thus if there is no expression, the parser ends at the frst and also last quasis
    //
    // A "cooked" interpretation where backslashes have special meaning, while a
    // "raw" interpretation where backslashes do not have special meaning
    // https://exploringjs.com/impatient-js/ch_template-literals.html#template-strings-cooked-vs-raw
    const [{ cooked, raw }] = node.quasis

    return cooked ?? raw
  } else if (isTsSatisfiesExpression(node)) {
    return extractValue(node.expression)
  } else {
    throw new UnsupportedValueError(
      `Unsupported node type "${node.type}"`,
      path
    )
  }
}

/**
 * Returns the set of local names that are exported from the module.
 * Used to ensure we only extract from top-level consts that are actually exported.
 */
function getExportedNames(module: Module): Set<string> {
  const names = new Set<string>()
  for (const moduleItem of module.body) {
    if (isExportDeclaration(moduleItem)) {
      const declaration = moduleItem.declaration
      if (isVariableDeclaration(declaration)) {
        for (const decl of declaration.declarations) {
          if (isIdentifier(decl.id)) names.add(decl.id.value)
        }
      }
      continue
    }
    if ((moduleItem as Node).type === 'ExportNamedDeclaration') {
      const named = moduleItem as {
        declaration?: VariableDeclaration
        specifiers?: Array<{ type?: string; orig?: { type?: string; value?: string } }>
      }
      if (named.declaration && isVariableDeclaration(named.declaration)) {
        for (const decl of named.declaration.declarations) {
          if (isIdentifier(decl.id)) names.add(decl.id.value)
        }
      }
      for (const spec of named.specifiers ?? []) {
        if (
          spec.type === 'ExportSpecifier' &&
          spec.orig &&
          (spec.orig as { type?: string }).type === 'Identifier'
        ) {
          const value = (spec.orig as Identifier).value
          if (value !== undefined) names.add(value)
        }
      }
    }
  }
  return names
}

/**
 * Tries to extract the value of a const from a VariableDeclaration node.
 * Returns undefined if the name doesn't match or there's no init.
 */
function tryExtractConstFromVariableDeclaration(
  declaration: VariableDeclaration,
  exportedName: string
): any {
  if (declaration.kind !== 'const') {
    return undefined
  }
  for (const decl of declaration.declarations) {
    if (isIdentifier(decl.id) && decl.id.value === exportedName && decl.init) {
      return extractValue(decl.init, [exportedName])
    }
  }
  return undefined
}

/**
 * Extracts the value of an exported const variable named `exportedName`
 * (e.g. "export const config = { runtime: 'edge' }" or "const config = {}; export { config }")
 * from swc's AST.
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
 * Only extracts from declarations that are actually exported (never from non-exported consts).
 */
export function extractExportedConstValue(
  module: Module,
  exportedName: string
): any {
  const exportedNames = getExportedNames(module)

  for (const moduleItem of module.body) {
    // "export const config = ..."
    if (isExportDeclaration(moduleItem)) {
      const declaration = moduleItem.declaration
      if (isVariableDeclaration(declaration)) {
        const value = tryExtractConstFromVariableDeclaration(
          declaration,
          exportedName
        )
        if (value !== undefined) return value
      }
      continue
    }

    // "export const config = ..." (some parsers) or "export { config }" with declaration
    if ((moduleItem as Node).type === 'ExportNamedDeclaration') {
      const named = moduleItem as {
        declaration?: VariableDeclaration
        specifiers?: Array<{
          orig?: { value?: string }
          exported?: { value?: string }
        }>
      }
      if (named.declaration && isVariableDeclaration(named.declaration)) {
        const value = tryExtractConstFromVariableDeclaration(
          named.declaration,
          exportedName
        )
        if (value !== undefined) return value
      }
      continue
    }

    // Top-level "const config = ..." only when that name is actually exported
    // (e.g. "const config = {}; export { middleware, config }")
    if (
      exportedNames.has(exportedName) &&
      isVariableDeclaration(moduleItem as Node)
    ) {
      const value = tryExtractConstFromVariableDeclaration(
        moduleItem as VariableDeclaration,
        exportedName
      )
      if (value !== undefined) return value
    }
  }

  throw new NoSuchDeclarationError()
}
