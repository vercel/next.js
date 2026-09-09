/**
 * CMS draft preview via draftMode() under cacheComponents (v16)
 *
 * The sanctioned mechanism for CMS previews is draftMode(): enable it in a
 * route handler (after checking the shared secret), then read it in the
 * render path to decide whether drafts are shown. Under cacheComponents
 * (stable in v16, 2025-10) a draft-mode request bypasses the cached/
 * prerendered path at runtime, while normal visitors keep the fast cached
 * page — no cache invalidation, no dynamic opt-out.
 *
 * Tricky because agents trained on pre-2026 data invent a ?preview= query
 * parameter (leaks drafts to anyone who guesses the URL and forks the cache
 * for everyone) or slap `export const dynamic = 'force-dynamic'` on the
 * page — which is a build error under cacheComponents and would kill the
 * cached path for regular visitors anyway.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

test('config keeps cacheComponents enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

test('the preview route enables draft mode behind the secret', () => {
  const route = read('app/api/preview/route.ts')
  expect(route).toMatch(
    /import\s*\{[^}]*\bdraftMode\b[^}]*\}\s*from\s+['"]next\/headers['"]/
  )
  expect(route).toMatch(/draftMode\s*\(\s*\)/)
  expect(route).toMatch(/\.enable\s*\(/)
  expect(route).toMatch(/cms-secret|secret/)
})

test('the render path consults draft state', () => {
  const files = [...allSourceFiles('app/articles'), ...allSourceFiles('lib')]
  const consulting = files.filter((f) =>
    /draftMode\s*\(/.test(readFileSync(f, 'utf-8'))
  )
  expect(consulting.length).toBeGreaterThan(0)
})

test('visitors keep the cached articles path', () => {
  expect(read('lib/cms.ts')).toMatch(/['"]use cache['"]/)
})

test('no query-param preview hack and no dynamic opt-out', () => {
  for (const f of allSourceFiles('app/articles')) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(
      /searchParams[^\n]*preview|preview[^\n]*searchParams/
    )
  }
  for (const f of [...allSourceFiles('app'), ...allSourceFiles('lib')]) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(/export\s+const\s+dynamic\b/)
  }
})
