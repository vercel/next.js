const { Minimatch } = require('minimatch')

const url = 'https://nextjs.org/docs/messages/no-server-import-in-page'

const baseAllowed = ['**/middleware.{js,ts}']

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    docs: {
      description: 'Prevent usage of `next/server` outside of `middleware.js`.',
      recommended: true,
      url,
    },
    schema: [
      {
        oneOf: [
          {
            description:
              'Allow using `next/server` in files matching this glob pattern.',
            type: 'string',
          },
          {
            description:
              'Allow using `next/server` in files matching these glob patterns.',
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
    /** @type {string[]} */
    const userAllowed = context.options[0] ? [context.options[0]].flat() : []

    const allowed = baseAllowed.concat(userAllowed)
    const allowedMatchers = allowed.map((pattern) => new Minimatch(pattern))

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'next/server') {
          return
        }

        const filename = context.getFilename()
        if (allowedMatchers.some((matcher) => matcher.match(filename))) {
          return
        }

        context.report({
          node,
          message: `\`next/server\` should not be used outside of \`middleware.js\` or other allowed files. See: ${url}`,
        })
      },
    }
  },
}
