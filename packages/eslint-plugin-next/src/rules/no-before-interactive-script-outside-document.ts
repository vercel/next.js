import { defineRule } from '../utils/define-rule'
import * as path from 'path'
import { isInAppDir } from '../utils/get-root-dirs'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

export default defineRule({
  meta: {
    docs: {
      description:
        "Prevent usage of `next/script`'s `beforeInteractive` strategy outside of `pages/_document.js`.",
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
        node: any
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

        // This rule shouldn't fire in `app/`
        if (isInAppDir(context)) {
          return
        }

        const document = context.filename.split('pages', 2)[1]
        if (document && path.parse(document).name.startsWith('_document')) {
          return
        }

        context.report({
          node,
          message: `\`next/script\`'s \`beforeInteractive\` strategy should not be used outside of \`pages/_document.js\`. See: ${url}`,
        })
      },
    }
  },
})
