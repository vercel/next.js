import path from 'node:path'
import { defineRule } from '../utils/define-rule.js'

const url = 'https://nextjs.org/docs/messages/no-head-element'

export const noHeadElement = defineRule({
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
  create(context: any) {
    return {
      JSXOpeningElement(node: any) {
        const paths = context.filename

        const isInAppDir = () =>
          paths.includes(`app${path.sep}`) ||
          paths.includes(`app${path.posix.sep}`)
        // Only lint the <head> element in pages directory
        if (node.name.name !== 'head' || isInAppDir()) {
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
