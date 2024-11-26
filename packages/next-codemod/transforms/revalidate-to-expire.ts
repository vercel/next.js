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
  let revalidatePathName = 'revalidatePath'
  let revalidateTagName = 'revalidateTag'
  let expirePathName = 'expirePath'
  let expireTagName = 'expireTag'

  nextCacheImports.forEach((path) => {
    let hasExpirePath = false
    let hasExpireTag = false

    // Set the alias name for callee if exists.
    path.node.specifiers.forEach((specifier) => {
      if (specifier.type === 'ImportSpecifier') {
        if (specifier.imported.name === 'expirePath') {
          expirePathName = specifier.local?.name ?? 'expirePath'
          hasExpirePath = true
        }
        if (specifier.imported.name === 'expireTag') {
          expireTagName = specifier.local?.name ?? 'expireTag'
          hasExpireTag = true
        }
      }
    })

    // Remove the revalidate functions from the import specifiers if
    // expire functions are also imported.
    path.node.specifiers = path.node.specifiers.filter((specifier) => {
      if (specifier.type !== 'ImportSpecifier') {
        return true
      }
      if (hasExpireTag && specifier.imported.name === 'revalidateTag') {
        revalidateTagName = specifier.local?.name ?? 'revalidateTag'
        return false
      }
      if (hasExpirePath && specifier.imported.name === 'revalidatePath') {
        revalidatePathName = specifier.local?.name ?? 'revalidatePath'
        return false
      }
      return true
    })

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
      (callee.name === revalidateTagName || callee.name === revalidatePathName)
    ) {
      callee.name =
        callee.name === revalidateTagName ? expireTagName : expirePathName
    }

    // Handle namespace calls:
    // ```ts
    // import * as cache from 'next/cache'
    // ```
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === nextCacheNamespace
    ) {
      // cache.revalidateTag('next')
      // cache.revalidatePath('/next')
      if (
        callee.property.type === 'Identifier' &&
        (callee.property.name === 'revalidateTag' ||
          callee.property.name === 'revalidatePath')
      ) {
        callee.property.name =
          callee.property.name === 'revalidateTag' ? 'expireTag' : 'expirePath'
      }

      // cache['revalidateTag']('next')
      // cache['revalidatePath']('/next')
      if (
        callee.property.type === 'StringLiteral' &&
        (callee.property.value === 'revalidateTag' ||
          callee.property.value === 'revalidatePath')
      ) {
        callee.property.value =
          callee.property.value === 'revalidateTag' ? 'expireTag' : 'expirePath'
      }
    }
  })

  return root.toSource()
}
