import { defineRule } from '../utils/define-rule'
import * as path from 'path'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

const convertToCorrectSeparator = (str: string) =>
  str.replace(/[\\/]/g, path.sep)

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
        const pathname = convertToCorrectSeparator(context.filename)

        const isInAppDir = pathname.includes(`${path.sep}app${path.sep}`)

        // This rule shouldn't fire in `app/`
        if (isInAppDir) {
          return
        }

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
