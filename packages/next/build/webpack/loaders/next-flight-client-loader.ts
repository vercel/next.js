/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// TODO: add ts support for next-swc api
// @ts-ignore
import { parse } from '../../swc'
// @ts-ignore
import { getBaseSWCOptions } from '../../swc/options'

function addExportNames(names: string[], node: any) {
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

async function parseExportNamesInto(
  resourcePath: string,
  transformedSource: string,
  names: Array<string>
): Promise<void> {
  const opts = getBaseSWCOptions({
    filename: resourcePath,
    globalWindow: true,
  })

  const { body } = await parse(transformedSource, {
    ...opts.jsc.parser,
    isModule: true,
  })
  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    switch (node.type) {
      // TODO: support export * from module path
      // case 'ExportAllDeclaration':
      case 'ExportDefaultDeclaration':
        names.push('default')
        continue
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
        if (node.specificers) {
          const specificers = node.specificers
          for (let j = 0; j < specificers.length; j++) {
            addExportNames(names, specificers[j].exported)
          }
        }
        continue
      default:
        break
    }
  }
}

export default async function transformSource(
  this: any,
  source: string
): Promise<string> {
  const { resourcePath, resourceQuery } = this

  if (resourceQuery !== '?flight') return source

  let url = resourcePath
  const transformedSource = source
  if (typeof transformedSource !== 'string') {
    throw new Error('Expected source to have been transformed to a string.')
  }

  const names: string[] = []
  await parseExportNamesInto(resourcePath, transformedSource, names)

  // next.js/packages/next/<component>.js
  if (/[\\/]next[\\/](link|image)\.js$/.test(url)) {
    names.push('default')
  }

  let newSrc =
    "const MODULE_REFERENCE = Symbol.for('react.module.reference');\n"
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (name === 'default') {
      newSrc += 'export default '
    } else {
      newSrc += 'export const ' + name + ' = '
    }
    newSrc += '{ $$typeof: MODULE_REFERENCE, filepath: '
    newSrc += JSON.stringify(url)
    newSrc += ', name: '
    newSrc += JSON.stringify(name)
    newSrc += '};\n'
  }

  return newSrc
}
