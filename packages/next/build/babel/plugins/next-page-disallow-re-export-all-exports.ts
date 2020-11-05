import { NodePath, PluginObj, types } from 'next/dist/compiled/babel/core'

export default function NextPageDisallowReExportAllExports(): PluginObj<any> {
  return {
    visitor: {
      ExportAllDeclaration(path: NodePath<types.ExportAllDeclaration>) {
        const err = new SyntaxError(
          `Using \`export * from '...'\` in a page is disallowed. Please use \`export { default } from '...'\` instead.\n` +
            `Read more: https://err.sh/next.js/export-all-in-page`
        )
        ;(err as any).code = 'BABEL_PARSE_ERROR'
        ;(err as any).loc =
          path.node.loc?.start ?? path.node.loc?.end ?? path.node.loc
        throw err
      },
    },
  }
}
