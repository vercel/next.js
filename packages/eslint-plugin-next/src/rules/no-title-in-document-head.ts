import { defineRule } from '../utils/define-rule.js'
const url = 'https://nextjs.org/docs/messages/no-title-in-document-head'

export const noTitleInDocumentHead = defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `<title>` with `Head` component from `next/document`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context: any) {
    let headFromNextDocument = false
    return {
      ImportDeclaration(node: any) {
        if (node.source.value === 'next/document') {
          if (
            node.specifiers.some(
              ({ local }: { local: any }) => local.name === 'Head'
            )
          ) {
            headFromNextDocument = true
          }
        }
      },
      JSXElement(node: any) {
        if (!headFromNextDocument) {
          return
        }

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== 'Head'
        ) {
          return
        }

        const titleTag = node.children.find(
          (child: any) =>
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.type === 'JSXIdentifier' &&
            child.openingElement.name.name === 'title'
        )

        if (titleTag) {
          context.report({
            node: titleTag,
            message: `Do not use \`<title>\` element with \`<Head />\` component from \`next/document\`. Titles should defined at the page-level using \`<Head />\` from \`next/head\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})
