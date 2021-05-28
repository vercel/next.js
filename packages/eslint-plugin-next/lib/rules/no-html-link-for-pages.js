const path = require('path')
const fs = require('fs')
const {
  getUrlFromPagesDirectories,
  normalizeURL,
  execOnce,
} = require('../utils/url')

const pagesDirWarning = execOnce((pagesDirs) => {
  console.warn(
    `Pages directory cannot be found at ${pagesDirs.join(' or ')}. ` +
      `If using a custom path, please configure with the no-html-link-for-pages rule in your eslint config file`
  )
})

// Cache for fs.existsSync lookup.
// Prevent multiple blocking IO requests that have already been calculated.
const fsExistsSyncCache = {}

module.exports = {
  meta: {
    docs: {
      description: 'Prohibit full page refresh for nextjs pages',
      category: 'HTML',
      recommended: true,
    },
    fixable: null, // or "code" or "whitespace"
    schema: [
      {
        oneOf: [
          {
            type: 'string',
          },
          {
            type: 'array',
            uniqueItems: true,
            items: {
              type: 'string',
            },
          },
        ],
      },
    ],
  },

  create: function (context) {
    const [customPagesDirectory] = context.options
    const pagesDirs = customPagesDirectory
      ? [customPagesDirectory].flat()
      : [
          path.join(context.getCwd(), 'pages'),
          path.join(context.getCwd(), 'src', 'pages'),
        ]
    const foundPagesDirs = pagesDirs.filter((dir) => {
      if (fsExistsSyncCache[dir] === undefined) {
        fsExistsSyncCache[dir] = fs.existsSync(dir)
      }
      return fsExistsSyncCache[dir]
    })
    if (foundPagesDirs.length === 0) {
      pagesDirWarning(pagesDirs)
      return {}
    }

    const urls = getUrlFromPagesDirectories('/', foundPagesDirs)
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
              message: `Do not use the HTML <a> tag to navigate to ${hrefPath}. Use Link from 'next/link' instead. See: https://nextjs.org/docs/messages/no-html-link-for-pages.`,
            })
          }
        })
      },
    }
  },
}
