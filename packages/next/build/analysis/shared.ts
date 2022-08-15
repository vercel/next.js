import type {
  ArrayExpression,
  BooleanLiteral,
  CallExpression,
  ExportDeclaration,
  Expression,
  ExpressionStatement,
  Identifier,
  ImportDeclaration,
  KeyValueProperty,
  Node,
  NullLiteral,
  NumericLiteral,
  ObjectExpression,
  RegExpLiteral,
  StringLiteral,
  TemplateLiteral,
  VariableDeclaration,
} from '@swc/core'

export class NoSuchDeclarationError extends Error {}

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

export function isExportDeclaration(node: Node): node is ExportDeclaration {
  return node.type === 'ExportDeclaration'
}

export function isVariableDeclaration(node: Node): node is VariableDeclaration {
  return node.type === 'VariableDeclaration'
}

export function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier'
}

export function isBooleanLiteral(node: Node): node is BooleanLiteral {
  return node.type === 'BooleanLiteral'
}

export function isNullLiteral(node: Node): node is NullLiteral {
  return node.type === 'NullLiteral'
}

export function isStringLiteral(node: Node): node is StringLiteral {
  return node.type === 'StringLiteral'
}

export function isNumericLiteral(node: Node): node is NumericLiteral {
  return node.type === 'NumericLiteral'
}

export function isArrayExpression(node: Node): node is ArrayExpression {
  return node.type === 'ArrayExpression'
}

export function isObjectExpression(node: Node): node is ObjectExpression {
  return node.type === 'ObjectExpression'
}

export function isKeyValueProperty(node: Node): node is KeyValueProperty {
  return node.type === 'KeyValueProperty'
}

export function isRegExpLiteral(node: Node): node is RegExpLiteral {
  return node.type === 'RegExpLiteral'
}

export function isTemplateLiteral(node: Node): node is TemplateLiteral {
  return node.type === 'TemplateLiteral'
}

export function isImportDeclaration(node: Node): node is ImportDeclaration {
  return node.type === 'ImportDeclaration'
}

export function isExpressionStatement(node: Node): node is ExpressionStatement {
  return node.type === 'ExpressionStatement'
}

export function isCallExpression(
  expression: Expression
): expression is CallExpression {
  return expression.type === 'CallExpression'
}

export function extractValue(node: Node, path?: string[]): any {
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
  } else {
    throw new UnsupportedValueError(
      `Unsupported node type "${node.type}"`,
      path
    )
  }
}
