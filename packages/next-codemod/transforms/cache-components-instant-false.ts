import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

/**
 * Blanket-inserts `export const instant = false` into every App Router `page`
 * and `layout` file so that enabling `cacheComponents` does not break the
 * build. Each opt-out is meant to be walked back, one route at a time, using
 * the companion adoption skill.
 *
 * - Skips files that already export `instant` (never overrides existing config).
 * - Targets `page` / `layout` only (not `route` — `instant` does not apply to
 *   route handlers).
 */
export default function transformer(file: FileInfo, _api: API) {
  if (
    process.env.NODE_ENV !== 'test' &&
    !/[/\\]app[/\\].*?(page|layout)\.[^/\\]+$/.test(file.path)
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  // Bail if `instant` is already exported in any form:
  //   export const instant = ...
  //   export { instant }
  //   export { foo as instant }
  const existingInstantDeclaration = root.find(j.ExportNamedDeclaration, {
    declaration: {
      type: 'VariableDeclaration',
      declarations: [{ id: { name: 'instant' } }],
    },
  })

  const existingInstantSpecifier = root
    .find(j.ExportNamedDeclaration)
    .find(j.ExportSpecifier, { exported: { name: 'instant' } })

  if (
    existingInstantDeclaration.size() > 0 ||
    existingInstantSpecifier.size() > 0
  ) {
    return file.source
  }

  const instantExport = j.exportNamedDeclaration(
    j.variableDeclaration('const', [
      j.variableDeclarator(j.identifier('instant'), j.booleanLiteral(false)),
    ])
  )

  // Annotate so the inserted opt-outs are greppable while walking them back.
  j(instantExport).getAST()[0].node.comments = [
    j.commentLine(
      ' TODO: Cache Components adoption — remove once this route is instant.',
      true,
      false
    ),
  ]

  root.get().node.program.body.push(instantExport)

  return root.toSource()
}
