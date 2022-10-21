import type {
  API,
  Collection,
  FileInfo,
  ImportDefaultSpecifier,
  JSCodeshift,
  JSXAttribute,
  Options,
} from 'jscodeshift'

function findAndReplaceProps(
  j: JSCodeshift,
  root: Collection,
  tagName: string
) {
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
        el.value.openingElement.name.name === tagName
    )
    .forEach((el) => {
      let layout = 'intrinsic'
      let objectFit = null
      let objectPosition = null
      let styleExpProps = []
      let sizesAttr: JSXAttribute | null = null
      const attributes = el.node.openingElement.attributes?.filter((a) => {
        if (a.type !== 'JSXAttribute') {
          return true
        }

        if (a.name.name === 'layout' && 'value' in a.value) {
          layout = String(a.value.value)
          return false
        }
        if (a.name.name === 'objectFit' && 'value' in a.value) {
          objectFit = String(a.value.value)
          return false
        }
        if (a.name.name === 'objectPosition' && 'value' in a.value) {
          objectPosition = String(a.value.value)
          return false
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
        sizesAttr = j.jsxAttribute(j.jsxIdentifier('sizes'), j.literal(sizes))
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
}

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
      const tagName = defaultSpecifier?.local?.name

      if (tagName) {
        j(imageImport).replaceWith(
          j.importDeclaration(
            imageImport.node.specifiers,
            j.stringLiteral('next/image')
          )
        )
        findAndReplaceProps(j, root, tagName)
      }
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

  // Before: const Image = require("next/legacy/image")
  //  After: const Image = require("next/image")
  root.find(j.CallExpression).forEach((requireExp) => {
    if (
      requireExp?.value?.callee?.type === 'Identifier' &&
      requireExp.value.callee.name === 'require'
    ) {
      let firstArg = requireExp.value.arguments[0]
      if (
        firstArg &&
        firstArg.type === 'Literal' &&
        firstArg.value === 'next/legacy/image'
      ) {
        const tagName = requireExp?.parentPath?.value?.id?.name
        if (tagName) {
          requireExp.value.arguments[0] = j.literal('next/image')
          findAndReplaceProps(j, root, tagName)
        }
      }
    }
  })

  // TODO: do the same transforms for dynamic imports
  return root.toSource(options)
}
