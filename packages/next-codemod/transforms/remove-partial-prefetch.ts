import type { API, FileInfo, JSCodeshift } from 'jscodeshift'
import type { VariableDeclaration } from 'jscodeshift'
import { createParserFromPath } from '../lib/parser'

// Route Segment Config name and the only value this codemod strips.
const CONFIG_NAME = 'prefetch'
const TARGET_VALUE = 'partial'

// Unwrap `'partial' as const` / `'partial' satisfies T` so the value guard
// still matches when the export is annotated.
function unwrap(j: JSCodeshift, node: any) {
  if (
    (j.TSAsExpression && j.TSAsExpression.check(node)) ||
    (j.TSSatisfiesExpression && j.TSSatisfiesExpression.check(node))
  ) {
    return node.expression
  }
  return node
}

// Only `prefetch = 'partial'` matches. A different value such as
// `prefetch = 'allow-runtime'` is a legitimate config and is left untouched.
function isTargetPrefetch(j: JSCodeshift, decl: any): boolean {
  if (!j.VariableDeclarator.check(decl) || !j.Identifier.check(decl.id)) {
    return false
  }
  if (decl.id.name !== CONFIG_NAME || !decl.init) {
    return false
  }
  const init = unwrap(j, decl.init)
  return (
    (j.StringLiteral.check(init) && init.value === TARGET_VALUE) ||
    (j.Literal.check(init) && init.value === TARGET_VALUE)
  )
}

// Drop only the `prefetch = 'partial'` declarator, leaving any sibling
// declarators (e.g. `export const runtime = 'edge', prefetch = 'partial'`)
// intact. Returns the number of declarators left so the caller can remove the
// whole statement when it becomes empty.
function stripTargetDeclarators(
  j: JSCodeshift,
  declaration: VariableDeclaration
): number {
  declaration.declarations = declaration.declarations.filter(
    (decl) => !isTargetPrefetch(j, decl)
  )
  return declaration.declarations.length
}

// Removing a statement also removes the comments attached above it — which
// may be a user's note or a deliberate `// TODO(...)` marker. Reattach the
// leading comments to the next statement (or the previous one when the
// removed statement is last) so they survive the removal.
function preserveLeadingComments(path: any) {
  const comments = path.node.comments?.filter((comment: any) => comment.leading)
  if (!comments?.length) {
    return
  }
  const body = path.parent.node.body
  if (!Array.isArray(body)) {
    return
  }
  const index = body.indexOf(path.node)
  const next = body[index + 1]
  const prev = body[index - 1]
  if (next) {
    next.comments = [...comments, ...(next.comments ?? [])]
  } else if (prev) {
    for (const comment of comments) {
      comment.leading = false
      comment.trailing = true
    }
    prev.comments = [...(prev.comments ?? []), ...comments]
  }
}

export default function transformer(file: FileInfo, _api: API) {
  // Run on App Router page/layout files, except for test environment. The
  // `prefetch` Route Segment Config only applies to pages and layouts, so
  // route handlers are intentionally excluded.
  // `(^|[/\\])app` matches both an absolute path and a relative `app/...` path
  // (what `npx @next/codemod ... ./app` passes), so top-level app files aren't
  // silently skipped.
  if (
    process.env.NODE_ENV !== 'test' &&
    !/(^|[/\\])app[/\\](?:.*[/\\])?(page|layout)(\.[^/\\]*)?$/.test(file.path)
  ) {
    return file.source
  }

  const j = createParserFromPath(file.path)
  const root = j(file.source)

  let hasChanges = false

  // `export const prefetch = 'partial'` (possibly alongside other configs in
  // the same statement).
  root
    .find(j.ExportNamedDeclaration, {
      declaration: { type: 'VariableDeclaration' },
    })
    .filter((path) => {
      const declaration = path.node.declaration
      return (
        j.VariableDeclaration.check(declaration) &&
        declaration.declarations.some((decl) => isTargetPrefetch(j, decl))
      )
    })
    .forEach((path) => {
      const declaration = path.node.declaration as VariableDeclaration
      const remaining = stripTargetDeclarators(j, declaration)
      // Remove the whole export only when nothing else was declared with it.
      if (remaining === 0) {
        preserveLeadingComments(path)
        j(path).remove()
      }
      hasChanges = true
    })

  // Bare `const prefetch = 'partial'` declarations are only Route Segment
  // Configs when the file also exports them as `prefetch` via a local
  // `export { prefetch }`. Re-exports (`export { prefetch } from '...'`) bind
  // another module's value, and aliased exports export a different name
  // (`export { prefetch as other }`) or a different binding
  // (`export { other as prefetch }`), so neither counts. When an aliased
  // export shares the `prefetch` binding, removing the declaration would
  // break it, so the whole file is left untouched.
  let hasPlainPrefetchExportSpecifier = false
  let hasAliasedPrefetchBinding = false
  root
    .find(j.ExportNamedDeclaration)
    .filter((path) => !path.node.source)
    .forEach((path) => {
      for (const spec of path.node.specifiers ?? []) {
        if (
          !j.ExportSpecifier.check(spec) ||
          !j.Identifier.check(spec.local) ||
          spec.local.name !== CONFIG_NAME
        ) {
          continue
        }
        if (
          j.Identifier.check(spec.exported) &&
          spec.exported.name === CONFIG_NAME
        ) {
          hasPlainPrefetchExportSpecifier = true
        } else {
          hasAliasedPrefetchBinding = true
        }
      }
    })
  const hasLocalPrefetchExportSpecifier =
    hasPlainPrefetchExportSpecifier && !hasAliasedPrefetchBinding

  // Track that we removed a bare declaration so we only drop the matching
  // export specifier below.
  let removedBareDeclaration = false
  if (hasLocalPrefetchExportSpecifier) {
    root
      .find(j.VariableDeclaration)
      .filter((path) => {
        // `export const prefetch` is handled above; skip it here.
        if (j.ExportNamedDeclaration.check(path.parent.node)) {
          return false
        }
        // Only top-level declarations can be the exported config. A local
        // `const prefetch` inside a function or block is unrelated code.
        if (!j.Program.check(path.parent.node)) {
          return false
        }
        return path.node.declarations.some((decl) => isTargetPrefetch(j, decl))
      })
      .forEach((path) => {
        const remaining = stripTargetDeclarators(j, path.node)
        if (remaining === 0) {
          preserveLeadingComments(path)
          j(path).remove()
        }
        removedBareDeclaration = true
        hasChanges = true
      })
  }

  // Handle `export { prefetch }` and `export { prefetch, other }`, but only
  // when the paired declaration was the `'partial'` one we removed above.
  if (removedBareDeclaration) {
    root
      .find(j.ExportNamedDeclaration)
      // Skip re-exports (`export { prefetch } from '...'`): their specifiers
      // reference another module's binding, not the declaration we removed.
      .filter(
        (path) => !path.node.source && Boolean(path.node.specifiers?.length)
      )
      .forEach((path) => {
        const specifiers = path.node.specifiers
        if (!specifiers) return

        const filteredSpecifiers = specifiers.filter((spec) => {
          // Remove only the plain `export { prefetch }` specifier. Aliased
          // specifiers export a different name or bind a different value, so
          // they aren't the Route Segment Config.
          if (
            j.ExportSpecifier.check(spec) &&
            j.Identifier.check(spec.local) &&
            j.Identifier.check(spec.exported)
          ) {
            return !(
              spec.local.name === CONFIG_NAME &&
              spec.exported.name === CONFIG_NAME
            )
          }
          return true
        })

        if (filteredSpecifiers.length !== specifiers.length) {
          hasChanges = true

          if (filteredSpecifiers.length === 0) {
            preserveLeadingComments(path)
            j(path).remove()
          } else {
            path.node.specifiers = filteredSpecifiers
          }
        }
      })
  }

  if (hasChanges) {
    return root.toSource()
  }

  return file.source
}
