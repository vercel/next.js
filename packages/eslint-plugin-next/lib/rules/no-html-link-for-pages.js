const path = require('path')
const fs = require('fs')
const { getUrlFromPagesDirectory, normalizeURL } = require('../utils/url')

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
module.exports = {
  meta: {
    docs: {
      description: 'Prohibit full page refresh for nextjs pages',
      category: 'HTML',
      recommended: true,
    },
    fixable: null, // or "code" or "whitespace"
    schema: ['pagesDirectory'],
  },

  create: function (context) {
    const [pagesDirectory] = context.options
    const pagesDir = pagesDirectory || path.join(context.getCwd(), 'pages')
    if (!fs.existsSync(pagesDir)) {
      throw new Error(
        `Pages directory cannot be found at ${pagesDir}, if using a custom path, please configure with the no-html-link-for-pages rule`
      )
    }

    const urls = getUrlFromPagesDirectory('/', pagesDir)
    return {
      JSXOpeningElement(node) {
        if (node.name.name !== 'a') {
          return
        }

        if (node.attributes.length === 0) {
          return
        }

        const href = node.attributes.find(
          (attr) => attr.type === 'JSXAttribute' && attr.name.name === 'href'
        )

        if (!href || href.value.type !== 'Literal') {
          return
        }

        const hrefPath = normalizeURL(href.value.value)
        // Outgoing links are ignored
        if (/^(https?:\/\/|\/\/)/.test(hrefPath)) {
          return
        }

        urls.forEach((url) => {
          if (url.test(normalizeURL(hrefPath))) {
            context.report({
              node,
              message: `You're using <a> tag to navigate to ${hrefPath}. Use Link from 'next/link' to make sure the app behaves like an SPA.`,
            })
          }
        })
      },
    }
  },
}
