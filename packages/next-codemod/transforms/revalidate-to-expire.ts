import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

export default function transformer(file: FileInfo, _api: API) {
  const j = createParserFromPath(file.path)
  const root = j(file.source)

  if (!root.length) {
    return
  }

  const nextCacheImports = root.find(j.ImportDeclaration, {
    source: {
      value: 'next/cache',
    },
  })

  if (!nextCacheImports.length) {
    return
  }

  let nextCacheNamespace = ''

  nextCacheImports.forEach((path) => {
    path.node.specifiers.forEach((specifier) => {
      if (specifier.type === 'ImportSpecifier') {
        if (specifier.imported.name === 'revalidateTag') {
          specifier.imported.name = 'expireTag'
        }
        if (specifier.imported.name === 'revalidatePath') {
          specifier.imported.name = 'expirePath'
        }
      }

      // import * as <namespace> from 'next/cache'
      if (specifier.type === 'ImportNamespaceSpecifier') {
        nextCacheNamespace = specifier.local.name
      }
    })
  })

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee

    // Handle direct function calls:
    // ```ts
    // revalidateTag('next')
    // revalidatePath('/next')
    // ```
    if (
      callee.type === 'Identifier' &&
      (callee.name === 'revalidateTag' || callee.name === 'revalidatePath')
    ) {
      callee.name = callee.name === 'revalidateTag' ? 'expireTag' : 'expirePath'
    }

    // Handle namespace calls:
    // ```ts
    // import * as cache from 'next/cache'
    // cache.revalidateTag('next')
    // cache.revalidatePath('/next')
    // ```
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === nextCacheNamespace &&
      callee.property.type === 'Identifier' &&
      (callee.property.name === 'revalidateTag' ||
        callee.property.name === 'revalidatePath')
    ) {
      callee.property.name =
        callee.property.name === 'revalidateTag' ? 'expireTag' : 'expirePath'
    }
  })

  return root.toSource()
}
