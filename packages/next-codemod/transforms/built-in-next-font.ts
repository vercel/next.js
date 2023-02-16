import type { API, FileInfo, Options } from 'jscodeshift'

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Before: import { ... } from '@next/font/google'
  // After: import { ... } from 'next/font/google'
  root
    .find(j.ImportDeclaration, {
      source: { value: '@next/font/google' },
    })
    .forEach((imageImport) => {
      j(imageImport).replaceWith(
        j.importDeclaration(
          imageImport.node.specifiers,
          j.stringLiteral('next/font/google')
        )
      )
    })

  // Before: import localFont from '@next/font/local'
  // After: import localFont from 'next/font/local'
  root
    .find(j.ImportDeclaration, {
      source: { value: '@next/font/local' },
    })
    .forEach((imageImport) => {
      j(imageImport).replaceWith(
        j.importDeclaration(
          imageImport.node.specifiers,
          j.stringLiteral('next/font/local')
        )
      )
    })

  return root.toSource(options)
}
