import { defineRule } from '../utils/define-rule'
import * as path from 'path'

const url =
  'https://nextjs.org/docs/messages/no-before-interactive-script-outside-document'

const startsWithUsingCorrectSeparators = (str: string, start: string) =>
  [path.sep, path.posix.sep].some((sep) =>
    str.startsWith(start.replace(/\//g, sep))
  )

/**
 * Removes the root directory path from the pathname.
 * @example
 * RootDir: '/Users/username/project'
 * Input: removeProjectRootPath('/Users/username/project/src/index.js')
 * Output: 'src/index.js'
 */
const removeProjectRootPath = (pathname: string) => {
  const currentRulePath = path.resolve(__dirname)

  // Finds the index of the first character that differs between the two paths.
  let endOfRootDirIdx = 0
  while (
    endOfRootDirIdx < currentRulePath.length &&
    endOfRootDirIdx < pathname.length &&
    currentRulePath[endOfRootDirIdx] === pathname[endOfRootDirIdx]
  ) {
    endOfRootDirIdx++
  }

  // Returns the pathname without the root directory path.
  return pathname.substring(endOfRootDirIdx)
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
        node: any
      ) {
        scriptImportName = node.local.name
      },
      JSXOpeningElement(node) {
        let pathname = context.getFilename()

        pathname = removeProjectRootPath(pathname)

        if (startsWithUsingCorrectSeparators(pathname, 'src/')) {
          pathname = pathname.slice(4)
        }

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
