import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-img-element'

export = defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `<img>` element due to slower LCP and higher bandwidth.',
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
          message: `Using \`<img>\` could result in slower LCP and higher bandwidth. Consider using \`<Image />\` from \`next/image\` to automatically optimize images. Note: when self-hosting, Image Optimization runs on your Next.js server; if using an external loader, additional usage or cost could be incurred, depending on your provider. For more details: ${url}`,
        })
      },
    }
  },
})
