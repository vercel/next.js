import path = require('path')
import { defineRule } from '../utils/define-rule'
import { getRootDirs } from '../utils/get-root-dirs'

const url = 'https://nextjs.org/docs/messages/no-head-element'

export = defineRule({
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
        const paths = context.getFilename()
        const rootDirs = getRootDirs(context)

        const isInAppDir = () => {
          return rootDirs
            .map((rootDir) => path.basename(rootDir))
            .some(
              (rootDir) =>
                paths.includes(`${rootDir}${path.sep}app${path.sep}`) ||
                paths.includes(
                  `${rootDir}${path.posix.sep}app${path.posix.sep}`
                ) ||
                paths.includes(
                  `${rootDir}${path.sep}src${path.sep}app${path.sep}`
                ) ||
                paths.includes(
                  `${rootDir}${path.posix.sep}src${path.posix.sep}app${path.posix.sep}`
                )
            )
        }
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
