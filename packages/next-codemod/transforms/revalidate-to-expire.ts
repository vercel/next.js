import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

export default function transformer(file: FileInfo, _api: API) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)

  if (!root.length) {
    return file.source
  }

  root
    .find(j.ImportDeclaration, {
      source: {
        value: 'next/cache',
      },
    })
    .forEach((path) => {
      path.node.specifiers.forEach((specifier) => {
        if (specifier.type !== 'ImportSpecifier') {
          return
        }
        if (specifier.imported.name === 'revalidateTag') {
          specifier.imported.name = 'expireTag'
        }
        if (specifier.imported.name === 'revalidatePath') {
          specifier.imported.name = 'expirePath'
        }
      })
    })

  root
    .find(j.CallExpression, {
      callee: {
        type: 'Identifier',
        name: (n) => n === 'revalidateTag' || n === 'revalidatePath',
      },
    })
    .forEach((path) => {
      if (path.node.callee.type === 'Identifier') {
        path.node.callee.name =
          path.node.callee.name === 'revalidateTag' ? 'expireTag' : 'expirePath'
      }
    })

  return root.toSource()
}
