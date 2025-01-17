import path = require('path')
import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-img-element'

export = defineRule({
  meta: {
    docs: {
      description:
        'Prevent usage of `<img>` element due to slower LCP and higher bandwidth.',
      category: 'HTML',
      recommended: true,
      url,
    },
    type: 'problem',
    schema: [],
  },
  create(context) {
    // Get relative path of the file
    const relativePath = context.filename
      .replace(path.sep, '/')
      .replace(context.cwd, '')
      .replace(/^\//, '')

    const isAppDir = /^(src\/)?app\//.test(relativePath)

    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'img') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        if (node.parent?.parent?.openingElement?.name?.name === 'picture') {
          return
        }

        // If is metadata route files, ignore
        // e.g. opengraph-image.js, twitter-image.js, icon.js
        if (
          isAppDir &&
          /\/opengraph-image|twitter-image|icon\.\w+$/.test(relativePath)
        )
          return

        context.report({
          node,
          message: `Using \`<img>\` could result in slower LCP and higher bandwidth. Consider using \`<Image />\` from \`next/image\` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: ${url}`,
        })
      },
    }
  },
})
