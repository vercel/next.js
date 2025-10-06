import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

export default function transformer(file: FileInfo, _api: API) {
  if (
    process.env.NODE_ENV !== 'test' &&
    !/[/\\]app[/\\].*?(page|layout|route)\.[^/\\]+$/.test(file.path)
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  const runtimeExport = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [
        {
          id: { name: 'runtime' },
        },
      ],
    },
  })

  if (runtimeExport.size() !== 1) {
    return file.source
  }

  const runtimeValue = runtimeExport.find(j.StringLiteral, {
    value: 'experimental-edge',
  })

  if (runtimeValue.size() !== 1) {
    return file.source
  }

  runtimeValue.replaceWith(j.stringLiteral('edge'))

  return root.toSource()
}
