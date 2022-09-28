import type { API, FileInfo, Options } from 'jscodeshift'

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Rename each import from "next/image" to "next/legacy/image"
  const imageImports = root.find(j.ImportDeclaration, {
    source: { value: 'next/image' },
  })

  imageImports.forEach((imageImport) => {
    j(imageImport).replaceWith(
      j.importDeclaration(
        imageImport.node.specifiers,
        j.stringLiteral('next/legacy/image')
      )
    )
  })

  // Rename each import from "next/future/image" to "next/image"
  const imageFutureImports = root.find(j.ImportDeclaration, {
    source: { value: 'next/future/image' },
  })

  imageFutureImports.forEach((imageFutureImport) => {
    j(imageFutureImport).replaceWith(
      j.importDeclaration(
        imageFutureImport.node.specifiers,
        j.stringLiteral('next/image')
      )
    )
  })

  // Learn more about renaming an import declaration here:
  // https://www.codeshiftcommunity.com/docs/import-manipulation/#replacerename-an-import-declaration

  return root.toSource(options)
}
