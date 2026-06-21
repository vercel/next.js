import type { API, FileInfo } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

/**
 * Blanket-inserts `export const instant = false` into every App Router `page`,
 * `layout`, and `default` file so that enabling `cacheComponents` does not
 * break the build. Each opt-out is meant to be walked back, one route at a
 * time, using the companion adoption skill.
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

  // Insert as raw text rather than mutating the AST and round-tripping through
  // `root.toSource()`. Recast's printer preserves unmodified subtrees, but the
  // moment we push a new statement into `program.body` it re-prints the whole
  // module — which normalizes quirks the original file had (mixed quotes,
  // indentation in JSX, missing semicolons) and produces a noisy diff. Raw
  // text insertion keeps every other byte exactly as the user wrote it.
  //
  // Place the opt-out right after the last `import`, so it's visible at the
  // top of the file when walking routes back without splitting any leading
  // comments attached to the first real statement (e.g. a "// TYPES" banner
  // sitting above an `interface`). When the module has no imports, fall back
  // to inserting after any leading comments on the first non-import statement
  // (so file pragmas like `// @ts-nocheck` keep working).
  const body = program.body as any[]
  const optOut =
    '// TODO: Cache Components adoption. Remove once this route navigates instantly.\n' +
    '// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components\n' +
    'export const instant = false;\n'

  const source = file.source

  let lastImportEnd = -1
  for (const node of body) {
    if (node.type === 'ImportDeclaration') {
      const end = node.end ?? node.range?.[1]
      if (typeof end === 'number' && end > lastImportEnd) lastImportEnd = end
    }
  }

  if (lastImportEnd !== -1) {
    let insertAt = lastImportEnd
    if (source[insertAt] === '\n') insertAt += 1
    return source.slice(0, insertAt) + '\n' + optOut + source.slice(insertAt)
  }

  // No imports. Insert before the first non-import statement, but *after* any
  // leading comments attached to it — comments like `@ts-nocheck` only work
  // as the very first comment of the file.
  const firstNonImport = body.find(
    (node: any) => node.type !== 'ImportDeclaration'
  )

  if (!firstNonImport) {
    // Imports-only module (unusual, but possible for re-export aggregations).
    const trailingNewline = source.endsWith('\n') ? '' : '\n'
    return source + trailingNewline + '\n' + optOut
  }

  let insertAt: number = firstNonImport.start
  const leadingComments =
    firstNonImport.leadingComments ?? firstNonImport.comments
  if (Array.isArray(leadingComments) && leadingComments.length > 0) {
    const lastLeadingEnd = leadingComments[leadingComments.length - 1].end
    if (typeof lastLeadingEnd === 'number' && lastLeadingEnd < insertAt) {
      insertAt = lastLeadingEnd
      if (source[insertAt] === '\n') insertAt += 1
    }
  }

  return source.slice(0, insertAt) + optOut + '\n' + source.slice(insertAt)
}
