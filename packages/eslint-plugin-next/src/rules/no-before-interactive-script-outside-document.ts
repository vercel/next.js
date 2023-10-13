import { defineRule } from '../utils/define-rule'
import * as path from 'path'
import { getRootDirs } from '../utils/get-root-dirs'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

const startsWithUsingCorrectSeparators = (str: string, start: string) =>
  [path.sep, path.posix.sep].some((sep) =>
    str.startsWith(start.replace(/\//g, sep))
  )

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
        const rootDirs = getRootDirs(context)
        const appDirs = rootDirs
          .map((dir) => [path.join(dir, 'app'), path.join(dir, 'src', 'app')])
          .flat()

        const isAppDir = (filepath: string) =>
          appDirs.some((appDir) => filepath.startsWith(appDir))

        // This rule shouldn't fire in `app/`
        if (isAppDir(pathname)) return

        if (startsWithUsingCorrectSeparators(pathname, 'src/')) {
          pathname = pathname.slice(4)
        } else if (startsWithUsingCorrectSeparators(pathname, '/src/')) {
          pathname = pathname.slice(5)
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
