/**
 * Proxy (formerly Middleware)
 *
 * Tests one thing: that the agent creates proxy.ts with a proxy() handler, the
 * Next.js 16+ convention, rather than the deprecated middleware.ts/middleware().
 *
 * Tricky because agents trained on pre-16 data reach for middleware.ts with a
 * middleware() function. The file and the function were both renamed.
 *
 * Deliberately scoped to the rename. What the handler does with the request is
 * not what this eval is measuring, so it is not asserted; adding checks for
 * that only creates ways for a correct solution to fail on style.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// The docs place the file at the project root or in src/, in .ts or .js.
const ROOTS = [process.cwd(), join(process.cwd(), 'src')]
const EXTS = ['ts', 'js']

function locate(base: string): string | undefined {
  for (const dir of ROOTS) {
    for (const ext of EXTS) {
      const candidate = join(dir, `${base}.${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }
}

/** Any export form binding `name`: declaration, const/let/var, default, or list. */
function exportsBinding(source: string, name: string): boolean {
  return (
    new RegExp(
      `export\\s+(default\\s+)?(async\\s+)?function\\s+${name}\\b`
    ).test(source) ||
    new RegExp(`export\\s+(const|let|var)\\s+${name}\\b`).test(source) ||
    new RegExp(`export\\s+default\\s+${name}\\b`).test(source) ||
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)
  )
}

test('creates proxy, not the deprecated middleware', () => {
  expect(locate('proxy'), 'expected a proxy file (Next.js 16+)').toBeDefined()
  expect(
    locate('middleware'),
    'middleware is deprecated in Next.js 16+; expected proxy instead'
  ).toBeUndefined()
})

test('the handler is named proxy, not middleware', () => {
  const path = locate('proxy')
  expect(path, 'no proxy file to inspect').toBeDefined()
  const source = readFileSync(path!, 'utf-8')

  // Any export form is fine — a typed arrow const is as valid as a declaration.
  // This is what stops an empty proxy file from satisfying the eval.
  expect(
    exportsBinding(source, 'proxy'),
    'expected the proxy file to export a handler named `proxy`'
  ).toBe(true)
  expect(
    exportsBinding(source, 'middleware'),
    'the Next.js 16+ handler is named `proxy`, not `middleware`'
  ).toBe(false)
})
