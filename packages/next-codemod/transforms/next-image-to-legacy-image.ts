import type { API, FileInfo, Options } from 'jscodeshift'

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  const imageImports = root.find(j.ImportDeclaration, {
    source: { value: 'next/image' },
  })

  imageImports.forEach((imageImport) => {
    //console.log(imageImport.node.source)
    //console.log(j.stringLiteral('next/legacy/image'))
    j(imageImport).replaceWith(
      j.importDeclaration(
        imageImport.node.specifiers, // copy over the existing import specificers
        j.stringLiteral('next/legacy/image') // Replace with our new source
      )
    )
  })

  return root.toSource(options)
}
