const NodeAttributes = require('../utils/node-attributes.js')
const { sep, posix } = require('path')

const url = 'https://nextjs.org/docs/messages/no-page-custom-font'

module.exports = {
  meta: {
    docs: {
      description: 'Prevent page-only custom fonts.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
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
    let localDefaultExportId
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
          localDefaultExportId = node.declaration.id
          return
        }

        if (
          node.declaration.type === 'ClassDeclaration' &&
          node.declaration.superClass &&
          node.declaration.superClass.name === documentImportName
        ) {
          localDefaultExportId = node.declaration.id
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
        if (!localDefaultExportId) {
          // find the top level of the module
          const program = ancestors.find(
            (ancestor) => ancestor.type === 'Program'
          )

          // go over each token to find the combination of `export default <name>`
          for (let i = 0; i <= program.tokens.length - 1; i++) {
            if (localDefaultExportId) {
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
                  localDefaultExportId = { name: maybeIdentifier.value }
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
              isIdentifierMatch(ancestor.id, localDefaultExportId)
            )
          }

          // function ...() {} export default ...
          // class ... extends ...; export default ...
          return isIdentifierMatch(ancestor.id, localDefaultExportId)
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
          const end = `This is discouraged. See: ${url}`

          const message = is_Document
            ? `Using \`<link />\` outside of \`<Head>\` will disable automatic font optimization. ${end}`
            : `Custom fonts not added in \`pages/_document.js\` will only load for a single page. ${end}`

          context.report({
            node,
            message,
          })
        }
      },
    }
  },
}

function isIdentifierMatch(id1, id2) {
  return (id1 === null && id2 === null) || (id1 && id2 && id1.name === id2.name)
}
