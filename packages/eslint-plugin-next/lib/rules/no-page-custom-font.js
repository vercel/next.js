const NodeAttributes = require('../utils/node-attributes.js')
const { sep, posix } = require('path')

module.exports = {
  meta: {
    docs: {
      description:
        'Recommend adding custom font in a custom document and not in a specific page',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-page-custom-font',
    },
  },
  create: function (context) {
    const paths = context.getFilename().split('pages')
    const page = paths[paths.length - 1]

    // outside of a file within `pages`, bail
    if (!page) {
      return {}
    }

    const is_Document =
      page.startsWith(`${sep}_document`) ||
      page.startsWith(`${posix.sep}_document`)

    let documentImportName
    let localDefaultExportName
    let exportDeclarationType

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/document') {
          const documentImport = node.specifiers.find(
            ({ type }) => type === 'ImportDefaultSpecifier'
          )
          if (documentImport && documentImport.local) {
            documentImportName = documentImport.local.name
          }
        }
      },

      ExportDefaultDeclaration(node) {
        exportDeclarationType = node.declaration.type

        if (node.declaration.type === 'FunctionDeclaration') {
          localDefaultExportName = node.declaration.id.name
          return
        }

        if (
          node.declaration.type === 'ClassDeclaration' &&
          node.declaration.superClass &&
          node.declaration.superClass.name === documentImportName
        ) {
          localDefaultExportName = node.declaration.id.name
        }
      },

      JSXOpeningElement(node) {
        if (node.name.name !== 'link') {
          return
        }

        const ancestors = context.getAncestors()

        // if `export default <name>` is further down within the file after the
        // currently traversed component, then `localDefaultExportName` will
        // still be undefined
        if (!localDefaultExportName) {
          // find the top level of the module
          const program = ancestors.find(
            (ancestor) => ancestor.type === 'Program'
          )

          // go over each token to find the combination of `export default <name>`
          for (let i = 0; i <= program.tokens.length - 1; i++) {
            if (localDefaultExportName) {
              break
            }

            const token = program.tokens[i]

            if (token.type === 'Keyword' && token.value === 'export') {
              const nextToken = program.tokens[i + 1]

              if (
                nextToken &&
                nextToken.type === 'Keyword' &&
                nextToken.value === 'default'
              ) {
                const maybeIdentifier = program.tokens[i + 2]

                if (maybeIdentifier && maybeIdentifier.type === 'Identifier') {
                  localDefaultExportName = maybeIdentifier.value
                }
              }
            }
          }
        }

        const parentComponent = ancestors.find((ancestor) => {
          // export default class ... extends ...
          if (exportDeclarationType === 'ClassDeclaration') {
            return (
              ancestor.type === exportDeclarationType &&
              ancestor.superClass &&
              ancestor.superClass.name === documentImportName
            )
          }

          // export default function ...
          if (exportDeclarationType === 'FunctionDeclaration') {
            return (
              ancestor.type === exportDeclarationType &&
              ancestor.id.name === localDefaultExportName
            )
          }

          // function ...() {} export default ...
          // class ... extends ...; export default ...
          return ancestor.id && ancestor.id.name === localDefaultExportName
        })

        // file starts with _document and this <link /> is within the default export
        if (is_Document && parentComponent) {
          return
        }

        const attributes = new NodeAttributes(node)
        if (!attributes.has('href') || !attributes.hasValue('href')) {
          return
        }

        const hrefValue = attributes.value('href')
        const isGoogleFont =
          typeof hrefValue === 'string' &&
          hrefValue.startsWith('https://fonts.googleapis.com/css')

        if (isGoogleFont) {
          const end =
            'This is discouraged. See https://nextjs.org/docs/messages/no-page-custom-font.'

          const message = is_Document
            ? `Rendering this <link /> not inline within <Head> of Document disables font optimization. ${end}`
            : `Custom fonts not added at the document level will only load for a single page. ${end}`

          context.report({
            node,
            message,
          })
        }
      },
    }
  },
}
