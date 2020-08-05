import { PluginObj, NodePath, types } from '@babel/core'

interface ConfigState {
  cwd: string
  filename: string
}

export default function NextPageDisallowReExportAllExports(): PluginObj<
  ConfigState
> {
  return {
    visitor: {
      ExportAllDeclaration(_path: NodePath<types.ExportAllDeclaration>, state) {
        const filename = (state.filename || '').split(state.cwd || '').pop()

        if (
          filename?.startsWith('/src/pages') ||
          filename?.startsWith('/pages')
        ) {
          throw new Error(
            `Re-exporting all exports from a page is disallowed. Happened in ${filename}. See: https://err.sh/vercel/next.js/export-all-in-page.md`
          )
        }
      },
    },
  }
}
