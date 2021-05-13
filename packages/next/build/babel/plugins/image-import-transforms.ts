import { PluginObj, types } from 'next/dist/compiled/babel/core'

type UrlUsageData = {
  url: string
  metaName: string
}

const getNewUrlSrc = (attribute: types.JSXAttribute) => {
  return (
    attribute.name.name === 'src' &&
    (attribute.value as types.JSXExpressionContainer).expression &&
    (attribute.value as types.JSXExpressionContainer).expression.type ===
      'NewExpression' &&
    (((attribute.value as types.JSXExpressionContainer)
      .expression as types.NewExpression).callee as types.Identifier).name &&
    (((attribute.value as types.JSXExpressionContainer)
      .expression as types.NewExpression).arguments[0] as types.StringLiteral)
      .value
  )
}

export default function ({ types: t }: { types: typeof types }): PluginObj {
  let imageComponent: string | null = null
  let newUrlUsages: UrlUsageData[] = []
  return {
    visitor: {
      Program: {
        exit(path) {
          const newImportStatements = newUrlUsages.map((urlUsage) => {
            return t.importDeclaration(
              [t.importDefaultSpecifier(t.identifier(urlUsage.metaName))],
              t.stringLiteral(urlUsage.url)
            )
          })
          path.unshiftContainer('body', newImportStatements)
        },
      },
      ImportDeclaration(path) {
        if (path.node.source.value === 'next/image') {
          imageComponent = path.node.specifiers[0].local.name
        }
      },
      JSXOpeningElement(path) {
        if (
          !imageComponent ||
          (path.node.name as types.JSXIdentifier).name !== imageComponent
        ) {
          return
        }
        const attributes = path.node.attributes

        for (let attribute of attributes) {
          let url = getNewUrlSrc(attribute as types.JSXAttribute)
          if (url) {
            const metaName = 'meta' + newUrlUsages.length
            newUrlUsages.push({ url, metaName })
            attributes.push(
              t.jsxAttribute(
                t.jsxIdentifier('meta'),
                t.jsxExpressionContainer(t.identifier(metaName))
              )
            )
            break
          }
        }
      },
    },
  }
}
