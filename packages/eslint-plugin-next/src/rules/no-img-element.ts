import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-img-element'

export = defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `<img>` element to prevent layout shift.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'img') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        if (node.parent?.parent?.openingElement?.name?.name === 'picture') {
          return
        }

        context.report({
          node,
          message: `Do not use \`<img>\` element. Use \`<Image />\` from \`next/image\` instead. See: ${url}`,
        })
      },
    }
  },
})
