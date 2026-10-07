import path from 'path'
import { defineRule } from '../utils/define-rule'

const url = 'https://nextjs.org/docs/messages/no-img-element'

// Packages that export ImageResponse for OG image generation
const IMAGE_RESPONSE_PACKAGES = ['next/og', '@vercel/og']

export default defineRule({
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

    // Track whether this file imports ImageResponse from next/og or @vercel/og.
    // When ImageResponse is used, <img> is the correct API inside the JSX
    // passed to ImageResponse and next/image cannot be used there.
    let hasImageResponseImport = false

    return {
      ImportDeclaration(node) {
        if (!IMAGE_RESPONSE_PACKAGES.includes(node.source.value as string)) {
          return
        }
        const hasImageResponseSpecifier = node.specifiers.some(
          (specifier) =>
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.name === 'ImageResponse'
        )
        if (hasImageResponseSpecifier) {
          hasImageResponseImport = true
        }
      },

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

        // If the file imports ImageResponse from next/og or @vercel/og,
        // <img> is the only valid image element inside the ImageResponse JSX.
        // See: https://github.com/vercel/next.js/issues/47097
        if (hasImageResponseImport) {
          return
        }

        context.report({
          node,
          message: `Using \`<img>\` could result in slower LCP and higher bandwidth. Consider using \`<Image />\` from \`next/image\` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: ${url}`,
        })
      },
    }
  },
})
