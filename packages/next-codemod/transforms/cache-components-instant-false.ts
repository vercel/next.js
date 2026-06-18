import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

/**
 * Blanket-inserts `export const instant = false` into every App Router `page`
 * and `layout` file so that enabling `cacheComponents` does not break the
 * build. Each opt-out is meant to be walked back, one route at a time, using
 * the companion adoption skill.
 *
 * - Skips files that already declare or export `instant` in any form (never
 *   overrides existing config or appends a duplicate binding).
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

  // Bail if `instant` already exists in any form, so we never append a
  // duplicate declaration (which would be a `SyntaxError`). This covers:
  //   export const instant = ...
  //   export const a = 1, instant = ...   (any declarator position)
  //   const instant = ...                 (local binding)
  //   export { instant }
  //   export { foo as instant }
  //   export function instant() {} / export class instant {}
  const hasInstantBinding =
    root
      .find(j.VariableDeclarator)
      .filter((p) => {
        const id = p.node.id
        return id.type === 'Identifier' && id.name === 'instant'
      })
      .size() > 0 ||
    root.find(j.ExportSpecifier, { exported: { name: 'instant' } }).size() >
      0 ||
    root.find(j.FunctionDeclaration, { id: { name: 'instant' } }).size() > 0 ||
    root.find(j.ClassDeclaration, { id: { name: 'instant' } }).size() > 0

  if (hasInstantBinding) {
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
