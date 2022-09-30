import type { API, FileInfo, Options } from 'jscodeshift'

export default function transformer(
  file: FileInfo,
  api: API,
  options: Options
) {
  const j = api.jscodeshift
  const root = j(file.source)

  // Before: import Image from "next/legacy/image"
  //  After: import Image from "next/image"
  root
    .find(j.ImportDeclaration, {
      source: { value: 'next/legacy/image' },
    })
    .forEach((imageImport) => {
      const defaultSpecifier = imageImport.node.specifiers.find(
        (node) => node.type === 'ImportDefaultSpecifier'
      )
      const defaultSpecifierName = defaultSpecifier.local.name

      j(imageImport).replaceWith(
        j.importDeclaration(
          imageImport.node.specifiers,
          j.stringLiteral('next/image')
        )
      )

      root
        .find(j.JSXElement)
        .filter(
          (el) =>
            el.value.openingElement.name &&
            el.value.openingElement.name.type === 'JSXIdentifier' &&
            el.value.openingElement.name.name === defaultSpecifierName
        )
        .forEach((el) => {
          const style = {
            width: '100%',
            height: 'auto',
          }
          const props = Object.entries(style).map(([key, value]) =>
            j.objectProperty(j.identifier(key), j.stringLiteral(value))
          )
          const exp = j.objectExpression(props)
          let layoutValue = 'intrisic'
          el.node.openingElement.attributes.filter((a, i) => {
            if (a.type === 'JSXAttribute' && a.name.name === 'layout') {
              layoutValue = a.name.name
              return false
            }
            return true
          })
          j(el).replaceWith(
            j.jsxElement(
              j.jsxOpeningElement(el.node.openingElement.name, [
                ...el.node.openingElement.attributes,
                j.jsxAttribute(
                  j.jsxIdentifier('style'),
                  j.jsxExpressionContainer(exp)
                ),
              ]),
              el.node.closingElement,
              el.node.children
            )
          )
        })
      //   const node = jsxElement.node.name
      //   if (node.type === 'JSXIdentifier' && node.name === defaultSpecifierName) {
      //     console.log('found the jsx element: ' + node.name + ' with attributes: ', jsxElement.node.attributes)
      //     jsxElement.node.attributes.filter(attribute => {
      //       if (attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' && attribute.name.name === 'layout') {

      //       }
      //     })
      //   }
      // })
    })
  // Before: const Image = await import("next/legacy/image")
  //  After: const Image = await import("next/image")
  root
    .find(j.ImportExpression, {
      source: { value: 'next/legacy/image' },
    })
    .forEach((imageImport) => {
      j(imageImport).replaceWith(
        j.importExpression(j.stringLiteral('next/image'))
      )
    })

  return root.toSource(options)
}
