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
  // Find the insertion point by scanning the source line-by-line rather than
  // trusting AST node positions. Babel's parser misreports `node.start` /
  // `comment.end` on files with `\r\n` terminators (Windows checkouts), so
  // string-anchored scanning is the only reliable approach across line
  // endings.
  const source = file.source

  // Match the source's line terminator (CRLF on Windows checkouts, LF
  // elsewhere) so the inserted block doesn't mix terminators with the
  // surrounding file.
  const eol = source.includes('\r\n') ? '\r\n' : '\n'

  const optOut =
    `// TODO: Cache Components adoption. Remove once this route navigates instantly.${eol}` +
    `// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components${eol}` +
    `export const instant = false;${eol}`

  // Walk the source line by line and find the offset where we should splice
  // in the opt-out. The rule:
  //   1. If the module has any `import` statements, insert immediately after
  //      the last one (with a blank line separator).
  //   2. Otherwise, insert before the first line that is neither blank, nor a
  //      `//` comment, nor part of a `/* ... */` block comment.
  const lines = source.split(/(\r\n|\n)/)
  // `lines` interleaves text and separators: [text0, sep0, text1, sep1, ...].
  // Walk it pair-wise.
  let offset = 0
  let lastImportLineEnd = -1
  let firstStatementStart = -1
  let inBlockComment = false

  for (let i = 0; i < lines.length; i += 2) {
    const text = lines[i]
    const sep = lines[i + 1] ?? ''
    const lineStart = offset
    const lineEnd = offset + text.length + sep.length
    const trimmed = text.trim()

    // Track block-comment state. We don't care about exact bounds inside the
    // comment; we just need to skip the whole `/* ... */`.
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false
      offset = lineEnd
      continue
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true
      offset = lineEnd
      continue
    }

    // Skip blank lines and single-line `//` comments. A line that *starts*
    // with `/*` and *also closes* on the same line is a one-line block
    // comment — also skipped.
    const isBlank = trimmed === ''
    const isLineComment = trimmed.startsWith('//')
    const isOneLineBlockComment =
      trimmed.startsWith('/*') && trimmed.endsWith('*/')

    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('import{') ||
      trimmed.startsWith('import"') ||
      trimmed.startsWith("import'")
    ) {
      lastImportLineEnd = lineEnd
      offset = lineEnd
      continue
    }

    if (isBlank || isLineComment || isOneLineBlockComment) {
      offset = lineEnd
      continue
    }

    // First non-import, non-comment, non-blank line.
    firstStatementStart = lineStart
    break
  }

  if (lastImportLineEnd !== -1) {
    // After the last import. Add a blank line between the imports and the
    // opt-out for breathing room.
    return (
      source.slice(0, lastImportLineEnd) +
      eol +
      optOut +
      source.slice(lastImportLineEnd)
    )
  }

  if (firstStatementStart !== -1) {
    // Before the first real statement, after any leading comments.
    return (
      source.slice(0, firstStatementStart) +
      optOut +
      eol +
      source.slice(firstStatementStart)
    )
  }

  // Module is comments-only (very unusual) or empty. Append at the end.
  const trailingNewline = source.endsWith('\n') ? '' : eol
  return source + trailingNewline + eol + optOut
}
