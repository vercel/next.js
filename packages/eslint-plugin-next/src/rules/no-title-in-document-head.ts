import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-title-in-document-head'

export = defineRule({
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
  create(context) {
    let headFromNextDocument = false
    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/document') {
          if (node.specifiers.some(({ local }) => local.name === 'Head')) {
            headFromNextDocument = true
          }
        }
      },
      JSXElement(node) {
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
          (child) =>
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
