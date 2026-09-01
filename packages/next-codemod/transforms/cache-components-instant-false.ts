import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

/**
 * Blanket-inserts `export const instant = false` into every App Router `page`,
 * `layout`, and `default` file so they're marked as allowed to block when
 * `cacheComponents` is enabled. Each opt-out is meant to be walked back, one
 * route at a time, using the companion adoption skill.
 *
 * - Skips files that already declare or export `instant` in any form (never
 *   overrides existing config or appends a duplicate binding).
 * - Skips Client/Server Component modules (`"use client"` / `"use server"`):
 *   `instant` is a Server Component route segment config, so exporting it from
 *   those modules is a build error.
 * - Targets `page` / `layout` / `default` only (not `route` — `instant` does
 *   not apply to route handlers). `default.tsx` is the parallel-route fallback,
 *   a server segment that accepts route segment config like the other two.
 */
export default function transformer(file: FileInfo, _api: API) {
  if (
    process.env.NODE_ENV !== 'test' &&
    !/(^|[/\\])app[/\\].*?(page|layout|default)\.[^/\\]+$/.test(file.path)
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  // Bail on Client/Server Component modules. `instant` is a Server Component
  // route segment config; exporting it from a `"use client"` (or `"use server"`)
  // module fails the build. Parsers represent the directive either in
  // `program.directives` or as a leading string-literal `ExpressionStatement`.
  const program = root.get().node.program
  const isClientOrServerDirective = (value: unknown) =>
    value === 'use client' || value === 'use server'

  let hasModuleDirective = (program.directives ?? []).some((d: any) =>
    isClientOrServerDirective(d?.value?.value)
  )

  if (!hasModuleDirective) {
    for (const node of program.body) {
      if (
        node.type !== 'ExpressionStatement' ||
        (node.expression?.type !== 'StringLiteral' &&
          node.expression?.type !== 'Literal')
      ) {
        // Directives must lead the module; stop at the first non-directive.
        break
      }
      if (isClientOrServerDirective(node.expression.value)) {
        hasModuleDirective = true
        break
      }
    }
  }

  if (hasModuleDirective) {
    return file.source
  }

  // Bail if `instant` already exists in any form, so we never append a
  // duplicate declaration (which would be a `SyntaxError`). This covers:
  //   export const instant = ...
  //   export const a = 1, instant = ...   (any declarator position)
  //   const instant = ...                 (local binding)
  //   const { instant } = ...             (destructured binding)
  //   export { instant }
  //   export { foo as instant }
  //   export function instant() {} / export class instant {}
  const bindsInstant = (node: any): boolean => {
    switch (node?.type) {
      case 'Identifier':
        return node.name === 'instant'
      case 'ObjectPattern':
        return node.properties.some((prop: any) =>
          prop.type === 'RestElement'
            ? bindsInstant(prop.argument)
            : bindsInstant(prop.value ?? prop.argument)
        )
      case 'ArrayPattern':
        return node.elements.some((el: any) => el != null && bindsInstant(el))
      case 'AssignmentPattern':
        return bindsInstant(node.left)
      case 'RestElement':
        return bindsInstant(node.argument)
      default:
        return false
    }
  }

  const hasInstantBinding =
    root
      .find(j.VariableDeclarator)
      .filter((p) => bindsInstant(p.node.id))
      .size() > 0 ||
    root.find(j.ExportSpecifier, { exported: { name: 'instant' } }).size() >
      0 ||
    root.find(j.FunctionDeclaration, { id: { name: 'instant' } }).size() > 0 ||
    root.find(j.ClassDeclaration, { id: { name: 'instant' } }).size() > 0

  if (hasInstantBinding) {
    return file.source
  }

  // Build `export const instant = false`. The two `//` comments above it
  // (TODO + See:) are attached as leading comments on the declaration so
  // recast prints them right above it.
  const todoComment = j.commentLine(
    ' TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.',
    true,
    false
  )
  const seeComment = j.commentLine(
    ' See: https://nextjs.org/docs/app/guides/migrating-to-cache-components',
    true,
    false
  )
  const instantExport = j.exportNamedDeclaration(
    j.variableDeclaration('const', [
      j.variableDeclarator(j.identifier('instant'), j.booleanLiteral(false)),
    ])
  )
  instantExport.comments = [todoComment, seeComment]

  // Insert after the last top-level import, or at the top of the module
  // if there are no imports.
  const body = program.body as any[]
  let lastImportIndex = -1
  for (let i = 0; i < body.length; i++) {
    if (body[i].type === 'ImportDeclaration') lastImportIndex = i
  }

  if (lastImportIndex !== -1) {
    body.splice(lastImportIndex + 1, 0, instantExport)
  } else if (body.length > 0) {
    // No imports. Inserting at index 0 would steal any file-level leading
    // comments (e.g. `// @ts-nocheck`) from `body[0]` because recast
    // attributes them to whatever is first. Move those leading comments
    // off `body[0]` onto the new export *before* its TODO/See: lines, so
    // they print in their original position.
    const first = body[0]
    const allComments = (first.comments ?? []) as any[]
    const firstLeading = allComments.filter((c) => c.leading === true)
    if (firstLeading.length > 0) {
      first.comments = allComments.filter((c) => c.leading !== true)
      instantExport.comments = [...firstLeading, todoComment, seeComment]
    }
    body.unshift(instantExport)
  } else {
    body.push(instantExport)
  }

  return root.toSource()
}
