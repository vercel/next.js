import { defineRule } from '../utils/define-rule'
import * as path from 'path'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

const startsWithUsingCorrectSeparators = (str: string, start: string) =>
  [path.sep, path.posix.sep].some((sep) =>
    str.startsWith(start.replace(/\//g, sep))
  )

const trimBeforePath = (fullPath: string, paths: string[]): string => {
  for (const pathItem of paths) {
    const index = fullPath.indexOf(pathItem)
    if (index !== -1) {
      return fullPath.substring(index)
    }
  }
  return fullPath
}

export = defineRule({
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
        node
      ) {
        scriptImportName = node.local.name
      },
      JSXOpeningElement(node) {
        let pathname = context.getFilename()

        pathname = trimBeforePath(pathname, [
          'pages',
          'src/pages',
          'app',
          'src/app',
        ])

        // This rule shouldn't fire in `app/`
        if (startsWithUsingCorrectSeparators(pathname, 'app/')) {
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

        const document = context.getFilename().split('pages')[1]
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
