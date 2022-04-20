/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { promisify } from 'util'

import { parse } from '../../swc'
import { buildExports, isNextBuiltinClientComponent } from './utils'

function addExportNames(names: string[], node: any) {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      names.push(node.value)
      return
    case 'ObjectPattern':
      for (let i = 0; i < node.properties.length; i++)
        addExportNames(names, node.properties[i])
      return
    case 'ArrayPattern':
      for (let i = 0; i < node.elements.length; i++) {
        const element = node.elements[i]
        if (element) addExportNames(names, element)
      }
      return
    case 'Property':
      addExportNames(names, node.value)
      return
    case 'AssignmentPattern':
      addExportNames(names, node.left)
      return
    case 'RestElement':
      addExportNames(names, node.argument)
      return
    case 'ParenthesizedExpression':
      addExportNames(names, node.expression)
      return
    default:
      return
  }
}

async function collectExports(
  resourcePath: string,
  transformedSource: string,
  {
    resolve,
    loadModule,
  }: {
    resolve: (request: string) => Promise<string>
    loadModule: (request: string) => Promise<string>
  }
) {
  const names: string[] = []

  // Next.js built-in client components
  if (isNextBuiltinClientComponent(resourcePath)) {
    names.push('default')
  }

  const { body } = await parse(transformedSource, {
    filename: resourcePath,
    isModule: 'unknown',
  })

  for (let i = 0; i < body.length; i++) {
    const node = body[i]

    switch (node.type) {
      case 'ExportDefaultExpression':
      case 'ExportDefaultDeclaration':
        names.push('default')
        break
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          if (node.declaration.type === 'VariableDeclaration') {
            const declarations = node.declaration.declarations
            for (let j = 0; j < declarations.length; j++) {
              addExportNames(names, declarations[j].id)
            }
          } else {
            addExportNames(names, node.declaration.id)
          }
        }
        if (node.specifiers) {
          const specifiers = node.specifiers
          for (let j = 0; j < specifiers.length; j++) {
            addExportNames(names, specifiers[j].exported)
          }
        }
        break
      case 'ExportDeclaration':
        if (node.declaration?.identifier) {
          addExportNames(names, node.declaration.identifier)
        }
        break
      case 'ExpressionStatement': {
        const {
          expression: { left },
        } = node
        // exports.xxx = xxx
        if (
          left?.object &&
          left.type === 'MemberExpression' &&
          left.object.type === 'Identifier' &&
          left.object.value === 'exports'
        ) {
          addExportNames(names, left.property)
        }
        break
      }
      case 'ExportAllDeclaration':
        if (node.exported) {
          addExportNames(names, node.exported)
          break
        }

        const reexportedFromResourcePath = await resolve(node.source.value)
        const reexportedFromResourceSource = await loadModule(
          reexportedFromResourcePath
        )

        names.push(
          ...(await collectExports(
            reexportedFromResourcePath,
            reexportedFromResourceSource,
            { resolve, loadModule }
          ))
        )
        continue
      default:
        break
    }
  }

  return names
}

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  const { resourcePath, resolve, loadModule, context } = this

  const transformedSource = source
  if (typeof transformedSource !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const names = await collectExports(resourcePath, transformedSource, {
    resolve: (...args) => promisify(resolve)(context, ...args),
    loadModule: promisify(loadModule),
  })

  const moduleRefDef =
    "const MODULE_REFERENCE = Symbol.for('react.module.reference');\n"

  const isNextClientBuiltIn = isNextBuiltinClientComponent(resourcePath)

  const clientRefsExports = names.reduce((res: any, name) => {
    const moduleRef =
      '{ $$typeof: MODULE_REFERENCE, filepath: ' +
      JSON.stringify(resourcePath) +
      ', name: ' +
      JSON.stringify(name === 'default' && isNextClientBuiltIn ? '' : name) +
      ' };\n'
    res[name] = moduleRef
    return res
  }, {})

  // still generate module references in ESM
  const output = moduleRefDef + buildExports(clientRefsExports, true)
  return output
}
