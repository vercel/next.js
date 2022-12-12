import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-img-element'

export = defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `<img>` element to prevent layout shift favor optimized images.',
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
          message: `Using \`<img>\` could result in slower LCP and higher bandwidth. Use \`<Image />\` from \`next/image\` instead to utilize Image Optimization. See: ${url}`,
        })
      },
    }
  },
})
