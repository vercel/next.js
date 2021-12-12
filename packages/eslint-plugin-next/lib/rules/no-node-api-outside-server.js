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
    const serverMethodDeclarations = []

    return {
      ImportDeclaration(node) {
        if (COMMON_NODE_APIS.includes(node.source.value)) {
          node.specifiers.map((s) => nodeImportSpecifiers.push(s.local.name))
        }
      },
      ExportNamedDeclaration(node) {
        const d = node.declaration
        if (
          (d.type === 'FunctionDeclaration' &&
            SERVER_METHODS.includes(d.id.name)) ||
          (d.type === 'VariableDeclaration' &&
            SERVER_METHODS.includes(d.declarations[0].id.name))
        ) {
          serverMethodDeclarations.push(node)
        }
      },
      ExpressionStatement(node) {
        if (nodeImportSpecifiers.every((s) => s !== node.expression.name)) {
          return
        }
        const ancestors = context.getAncestors()
        const allowedParents = ancestors.filter((ancestor) => {
          return serverMethodDeclarations.some(
            ({ declaration: d }) =>
              // export function ...
              (d.type === 'FunctionDeclaration' &&
                isIdentifierMatch(d.id, ancestor.id)) ||
              // export const
              (d.type === 'VariableDeclaration' &&
                isIdentifierMatch(d.declarations[0].id, ancestor.id))
          )
        })

        if (allowedParents.length) {
          return
        }

        context.report({
          node,
          message:
            'Node.js APIs should only be referenced within server-side methods. See https://nextjs.org/docs/messages/no-node-api-outside-server.',
        })
      },
    }
  },
}

function isIdentifierMatch(id1, id2) {
  return (id1 === null && id2 === null) || (id1 && id2 && id1.name === id2.name)
}
