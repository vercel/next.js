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

  // Insert as raw text rather than mutating the AST and round-tripping through
  // `root.toSource()`. Recast's printer preserves unmodified subtrees, but the
  // moment we push a new statement into `program.body` it re-prints the whole
  // module — which normalizes quirks the original file had (mixed quotes,
  // indentation in JSX, missing semicolons) and produces a noisy diff. Raw
  // text insertion keeps every other byte exactly as the user wrote it.
  //
  // Babel mis-reports byte positions on files with `\r\n` terminators
  // (Windows checkouts), so we normalize the source to LF, find the insertion
  // offset on that LF view via the AST, then map the LF offset back into the
  // original (possibly CRLF) source by counting line breaks. Multi-line
  // imports and JSDoc banners thus work uniformly across line endings.
  const originalSource = file.source
  const eol = originalSource.includes('\r\n') ? '\r\n' : '\n'
  const isCRLF = eol === '\r\n'

  // Work on an LF-normalized copy so AST positions are accurate. Re-parse the
  // normalized source: the earlier `root` may have been built on CRLF.
  const lfSource = isCRLF
    ? originalSource.replace(/\r\n/g, '\n')
    : originalSource
  const lfRoot = isCRLF ? j(lfSource) : root
  const lfBody = lfRoot.get().node.program.body as any[]

  // Find the LF byte offset to insert at.
  let lfLastImportEnd = -1
  for (const node of lfBody) {
    if (node.type === 'ImportDeclaration') {
      const end = node.end ?? node.range?.[1]
      if (typeof end === 'number' && end > lfLastImportEnd)
        lfLastImportEnd = end
    }
  }

  // Convert an LF offset to an offset in the original source.
  const lfToOriginal = (lfOffset: number): number => {
    if (!isCRLF) return lfOffset
    // Each '\n' before `lfOffset` corresponds to a '\r\n' in the original,
    // so the original offset is `lfOffset` plus the count of LFs before it.
    let nl = 0
    for (let i = 0; i < lfOffset; i++) {
      if (lfSource.charCodeAt(i) === 10 /* \n */) nl++
    }
    return lfOffset + nl
  }

  // Step past the trailing newline of a statement so the opt-out lands on
  // its own line. Works on either LF or original (CRLF) source.
  const skipNewline = (s: string, offset: number): number => {
    if (s.charCodeAt(offset) === 13 /* \r */) offset++
    if (s.charCodeAt(offset) === 10 /* \n */) offset++
    return offset
  }

  const optOut =
    `// TODO: Cache Components adoption. Remove once this route navigates instantly.${eol}` +
    `// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components${eol}` +
    `export const instant = false;${eol}`

  if (lfLastImportEnd !== -1) {
    // Insert after the last import, on its own line, with a blank-line
    // separator before the opt-out.
    const lfInsertAt = skipNewline(lfSource, lfLastImportEnd)
    const insertAt = lfToOriginal(lfInsertAt)
    return (
      originalSource.slice(0, insertAt) +
      eol +
      optOut +
      originalSource.slice(insertAt)
    )
  }

  // No imports. Insert before the first non-import statement. AST gives us
  // the statement's start *including* its leading comments, so we walk back
  // through `leadingComments` to find the position past the last comment.
  const firstNonImport = lfBody.find(
    (node: any) => node.type !== 'ImportDeclaration'
  )

  if (!firstNonImport) {
    // Imports-only module (unusual, but possible for re-export aggregations).
    const trailingNewline = originalSource.endsWith('\n') ? '' : eol
    return originalSource + trailingNewline + eol + optOut
  }

  let lfInsertAt: number = firstNonImport.start
  const leadingComments =
    firstNonImport.leadingComments ?? firstNonImport.comments
  if (Array.isArray(leadingComments) && leadingComments.length > 0) {
    // Find the comment that ends *latest* in source order.
    let maxEnd = -1
    for (const c of leadingComments) {
      if (typeof c?.end === 'number' && c.end > maxEnd) maxEnd = c.end
    }
    if (maxEnd !== -1 && maxEnd < lfInsertAt) {
      lfInsertAt = skipNewline(lfSource, maxEnd)
    }
  }

  const insertAt = lfToOriginal(lfInsertAt)
  return (
    originalSource.slice(0, insertAt) +
    optOut +
    eol +
    originalSource.slice(insertAt)
  )
}
