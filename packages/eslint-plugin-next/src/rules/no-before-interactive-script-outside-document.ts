import { defineRule } from '../utils/define-rule'
import * as path from 'path'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

export = defineRule({
  meta: {
    docs: {
      description:
        "Prevent usage of `next/script`'s `beforeInteractive` strategy outside of `pages/_document.js` or root layout.",
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    let scriptImportName = null

    return {
      'ImportDeclaration[source.value="next/script"] > ImportDefaultSpecifier'(
        node
      ) {
        scriptImportName = node.local.name
      },
      JSXOpeningElement(node) {
        if (!scriptImportName) {
          return
        }

        if (node.name && node.name.name !== scriptImportName) {
          return
        }

        const strategy = node.attributes.find(
          (child) => child.name && child.name.name === 'strategy'
        )

        if (
          !strategy ||
          !strategy.value ||
          strategy.value.value !== 'beforeInteractive'
        ) {
          return
        }

        const filename = path.sep + context.getFilename()
        const document = filename.split('pages')[1]
        if (document && path.parse(document).name.startsWith('_document')) {
          return
        }

        if (
          // is in app dir
          filename.split(path.sep + 'app' + path.sep).length > 1 &&
          // is layout
          path.basename(filename).startsWith('layout.')
        ) {
          // TODO: check if it's root layout
          return
        }

        context.report({
          node,
          message: `\`next/script\`'s \`beforeInteractive\` strategy should not be used outside of \`pages/_document.js\` or root layout. See: ${url}`,
        })
      },
    }
  },
})
