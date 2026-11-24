/**
 * Look up the local binding at the mapped JSX position, not the first import
 * with the same spelling: a parameter can shadow an imported component.
 */
export function getJsxImportLocation(
  source: string,
  line: number,
  column: number | null
): { startLine: number; endLine: number } | undefined {
  // Some source maps contain entire generated bundles. Parsing those just to
  // enrich an error frame can be more expensive than rendering the error.
  if (!column || source.length > 64 * 1024) return
  const text = source.split('\n', line)[line - 1]
  if (!text) return
  const start = text[column - 1] === '<' ? column - 1 : column - 2
  if (start < 0 || !/^<[A-Z_$][\w$]*(?=[\s/>])/.test(text.slice(start))) return

  try {
    // Only load the parser for a frame pointing at an opening component tag.
    const { parse } =
      require('next/dist/compiled/babel/parser') as typeof import('next/dist/compiled/babel/parser')
    const { default: traverse } =
      require('next/dist/compiled/babel/traverse') as typeof import('next/dist/compiled/babel/traverse')
    const ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    })
    let location: { startLine: number; endLine: number } | undefined
    traverse(ast, {
      JSXOpeningElement(path) {
        const { loc, name } = path.node
        if (
          loc?.start.line !== line ||
          loc.start.column !== start ||
          name.type !== 'JSXIdentifier'
        ) {
          return
        }
        path.stop()
        const binding = path.scope.getBinding(name.name)
        const declaration = binding?.path.parentPath
        if (!declaration?.isImportDeclaration()) return
        const specifier = declaration.node.source
        // A relative import already points into the app. Show where an
        // external component entered the file without resolving the package.
        if (!/^[@\w]/.test(specifier.value) || !declaration.node.loc) return
        location = {
          startLine: declaration.node.loc.start.line,
          endLine: declaration.node.loc.end.line,
        }
      },
    })
    return location
  } catch {
    // Partial or unsupported source should never mask the original error.
    return
  }
}
