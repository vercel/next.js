import type {
  API,
  FileInfo,
  ImportDefaultSpecifier,
  JSXAttribute,
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
      const layoutToSizes: Record<string, string | null> = {
        intrinsic: null,
        responsive: '100vw',
        fill: '100vw',
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
          let layout = 'intrisic'
          let objectFit = null
          let objectPosition = null
          let styleExpProps = []
          let sizesAttr: JSXAttribute | null = null
          const attributes = el.node.openingElement.attributes?.filter((a) => {
            if (a.type !== 'JSXAttribute') {
              return true
            }
            // TODO: hanlde case when not Literal
            if (a.value?.type === 'Literal') {
              if (a.name.name === 'layout') {
                layout = String(a.value.value)
                return false
              }
              if (a.name.name === 'objectFit') {
                objectFit = String(a.value.value)
                return false
              }
              if (a.name.name === 'objectPosition') {
                objectPosition = String(a.value.value)
                return false
              }
            }
            if (a.name.name === 'style') {
              if (
                a.value?.type === 'JSXExpressionContainer' &&
                a.value.expression.type === 'ObjectExpression'
              ) {
                styleExpProps = a.value.expression.properties
              } else if (
                a.value?.type === 'JSXExpressionContainer' &&
                a.value.expression.type === 'Identifier'
              ) {
                styleExpProps = [
                  j.spreadElement(j.identifier(a.value.expression.name)),
                ]
              } else {
                console.warn('Unknown style attribute value detected', a.value)
              }
              return false
            }
            if (a.name.name === 'sizes') {
              sizesAttr = a
              return false
            }
            if (a.name.name === 'lazyBoundary') {
              return false
            }
            if (a.name.name === 'lazyRoot') {
              return false
            }
            return true
          })

          if (layout === 'fill') {
            attributes.push(j.jsxAttribute(j.jsxIdentifier('fill')))
          }

          const sizes = layoutToSizes[layout]
          if (sizes && !sizesAttr) {
            sizesAttr = j.jsxAttribute(
              j.jsxIdentifier('sizes'),
              j.literal(sizes)
            )
          }

          if (sizesAttr) {
            attributes.push(sizesAttr)
          }

          let style = layoutToStyle[layout]
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
            Object.entries(style).forEach(([key, value]) => {
              styleExpProps.push(
                j.objectProperty(j.identifier(key), j.stringLiteral(value))
              )
            })
            const styleAttribute = j.jsxAttribute(
              j.jsxIdentifier('style'),
              j.jsxExpressionContainer(j.objectExpression(styleExpProps))
            )
            attributes.push(styleAttribute)
          }

          // TODO: should we add `alt=""` attribute?
          // We should probably let the use it manually.

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
  // TODO: do the same transforms for dynamic imports
  return root.toSource(options)
}
