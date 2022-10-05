import type {
  API,
  FileInfo,
  ImportDefaultSpecifier,
  Options,
} from 'jscodeshift'

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
      const defaultSpecifier = imageImport.node.specifiers?.find(
        (node) => node.type === 'ImportDefaultSpecifier'
      ) as ImportDefaultSpecifier | undefined
      const defaultSpecifierName = defaultSpecifier?.local?.name

      j(imageImport).replaceWith(
        j.importDeclaration(
          imageImport.node.specifiers,
          j.stringLiteral('next/image')
        )
      )

      const layoutToStyle: Record<string, Record<string, string> | null> = {
        intrinsic: { maxWidth: '100%', height: 'auto' },
        responsive: { width: '100%', height: 'auto' },
        fill: null,
        fixed: null,
      }
      root
        .find(j.JSXElement)
        .filter(
          (el) =>
            el.value.openingElement.name &&
            el.value.openingElement.name.type === 'JSXIdentifier' &&
            el.value.openingElement.name.name === defaultSpecifierName
        )
        .forEach((el) => {
          let layoutValue = 'intrisic'
          let objectFit = null
          let objectPosition = null
          const attributes = el.node.openingElement.attributes?.filter((a) => {
            // TODO: hanlde case when not Literal
            if (
              a.type === 'JSXAttribute' &&
              a.name.name === 'layout' &&
              a.value?.type === 'Literal'
            ) {
              layoutValue = String(a.value.value)
              return false
            }

            if (
              a.type === 'JSXAttribute' &&
              a.name.name === 'objectFit' &&
              a.value?.type === 'Literal'
            ) {
              objectFit = String(a.value.value)
              return false
            }
            if (
              a.type === 'JSXAttribute' &&
              a.name.name === 'objectPosition' &&
              a.value?.type === 'Literal'
            ) {
              objectPosition = String(a.value.value)
              return false
            }
            return true
          })

          if (layoutValue === 'fill') {
            attributes.push(j.jsxAttribute(j.jsxIdentifier('fill')))
          }

          let style = layoutToStyle[layoutValue]
          if (style || objectFit || objectPosition) {
            if (!style) {
              style = {}
            }
            if (objectFit) {
              style.objectFit = objectFit
            }
            if (objectPosition) {
              style.objectPosition = objectPosition
            }
            const styleAttribute = j.jsxAttribute(
              j.jsxIdentifier('style'), // TODO: merge with existing "style" prop
              j.jsxExpressionContainer(
                j.objectExpression(
                  Object.entries(style).map(([key, value]) =>
                    j.objectProperty(j.identifier(key), j.stringLiteral(value))
                  )
                )
              )
            )
            attributes.push(styleAttribute)
          }

          j(el).replaceWith(
            j.jsxElement(
              j.jsxOpeningElement(
                el.node.openingElement.name,
                attributes,
                el.node.openingElement.selfClosing
              ),
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
