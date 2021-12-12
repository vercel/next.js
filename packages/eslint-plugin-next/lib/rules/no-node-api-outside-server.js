const SERVER_METHODS = [
  'getStaticPaths',
  'getStaticProps',
  'getServerSideProps',
]

const COMMON_NODE_APIS = ['fs', 'fs/promises', 'path']

module.exports = {
  meta: {
    docs: {
      description:
        'Disallow referencing common Node.js APIs outside server-side methods',
      recommended: true,
      url: 'https://nextjs.org/docs/messages/no-node-api-outside-server',
    },
  },
  create: function (context) {
    const paths = context.getFilename().split('pages')
    const page = paths[paths.length - 1]

    // outside of a file within `pages`, bail
    if (!page) {
      return {}
    }

    const nodeImportSpecifiers = []

    return {
      ImportDeclaration(node) {
        if (COMMON_NODE_APIS.includes(node.source.value)) {
          node.specifiers.map((s) => nodeImportSpecifiers.push(s.local.name))
        }
      },
      ExpressionStatement(node) {
        const expressionName = node.expression.name
        if (nodeImportSpecifiers.includes(expressionName)) {
          const ancestors = context.getAncestors()

          const allowedParent = SERVER_METHODS.some((s) =>
            ancestors.some(isIdentifierMatch(s))
          )
          if (allowedParent) return

          context.report({
            node,
            message:
              'Node.js APIs should only be referenced within server-side methods. See https://nextjs.org/docs/messages/no-node-api-outside-server.',
          })
        }
      },
    }
  },
}

function isIdentifierMatch(id1Name) {
  return function (id2) {
    return id2.id === null || (id2.id && id2.id.name === id1Name)
  }
}
