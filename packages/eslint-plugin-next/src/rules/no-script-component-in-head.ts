import { defineRule } from '../utils/define-rule'
const url = 'https://nextjs.org/docs/messages/no-script-component-in-head'

export = defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `next/script` in `next/head` component.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let isNextHead = null

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'next/head') {
          isNextHead = node.source.value
        }

        if (node.source.value !== 'next/script') {
          return
        }
      },
      JSXElement(node) {
        if (!isNextHead) {
          return
        }

        if (
          node.openingElement &&
          node.openingElement.name &&
          node.openingElement.name.name !== 'Head'
        ) {
          return
        }

        const scriptTag = node.children.find(
          (child) =>
            child.openingElement &&
            child.openingElement.name &&
            child.openingElement.name.name === 'Script'
        )

        if (scriptTag) {
          context.report({
            node,
            message: `\`next/script\` should not be used in \`next/head\` component. Move \`<Script />\` outside of \`<Head>\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})
