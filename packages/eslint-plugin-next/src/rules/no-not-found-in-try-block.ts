import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-notfound-in-try-block'

export = defineRule({
  meta: {
    docs: {
      description:
        'Prevent calling notFound() from "next/navigation" within a try block',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let notFoundImportedFromNextNavigation = false

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/navigation') {
          const notFoundImport = node.specifiers.find(
            (specifier) =>
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.name === 'notFound'
          )
          notFoundImportedFromNextNavigation = !!notFoundImport
        }
      },
      CallExpression(node) {
        if (notFoundImportedFromNextNavigation) {
          const { callee } = node
          if (callee.type === 'Identifier' && callee.name === 'notFound') {
            for (let current = node.parent; current; current = current.parent) {
              if (current.type === 'TryStatement') {
                context.report({
                  node,
                  message: `\`notFound\` should not be called inside a try/catch block. Move it outside of the try/catch block or into the \`finally\` block. See: ${url}`,
                })
                break
              }
            }
          }
        }
      },
    }
  },
})
