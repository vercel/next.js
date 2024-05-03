import { defineRule } from '../utils/define-rule'
import * as path from 'path'

const url = 'https://nextjs.org/docs/messages/no-head-import-in-document'

export = defineRule({
  meta: {
    docs: {
      description: 'Prevent usage of `next/head` in `pages/_document.js`.',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/head') {
          return
        }

        const document = context.getFilename().split('pages', 2)[1]
        if (!document) {
          return
        }

        const { name, dir } = path.parse(document)

        if (
          name.startsWith('_document') ||
          (dir === '/_document' && name === 'index')
        ) {
          context.report({
            node,
            message: `\`next/head\` should not be imported in \`pages${document}\`. Use \`<Head />\` from \`next/document\` instead. See: ${url}`,
          })
        }
      },
    }
  },
})
