import { defineRule } from '../utils/define-rule'
import { isInAppDir } from '../utils/get-root-dirs'

const url = 'https://nextjs.org/docs/messages/no-head-element'

export default defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `<head>` element.',
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
        // Only lint the <head> element in pages directory
        if (node.name.name !== 'head' || isInAppDir(context)) {
          return
        }

        context.report({
          node,
          message: `Do not use \`<head>\` element. Use \`<Head />\` from \`next/head\` instead. See: ${url}`,
        })
      },
    }
  },
})
