// Used when `experimental.acceptMarkdown` is enabled: exports the MDX file's
// original source as `markdown`, so Next.js can serve it to requests that
// prefer `Accept: text/markdown`. A `markdown` export written by the author
// takes precedence, and the plugin then leaves the module unchanged.

function exportsMarkdown(statement) {
  if (statement.type !== 'ExportNamedDeclaration') return false
  const { declaration, specifiers = [] } = statement
  if (declaration) {
    if (declaration.type === 'FunctionDeclaration') {
      return declaration.id?.name === 'markdown'
    }
    if (declaration.type === 'VariableDeclaration') {
      return declaration.declarations.some((d) => d.id?.name === 'markdown')
    }
  }
  return specifiers.some(
    (s) => (s.exported?.name ?? s.exported?.value) === 'markdown'
  )
}

module.exports = function remarkExportMarkdown() {
  return (tree, file) => {
    const authored = tree.children.some(
      (node) =>
        node.type === 'mdxjsEsm' &&
        node.data?.estree?.body?.some(exportsMarkdown)
    )
    if (authored) return

    const source = String(file.value)
    const raw = JSON.stringify(source)
    tree.children.unshift({
      type: 'mdxjsEsm',
      value: `export const markdown = ${raw}`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              source: null,
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'markdown' },
                    init: { type: 'Literal', value: source, raw },
                  },
                ],
              },
            },
          ],
        },
      },
    })
  }
}
