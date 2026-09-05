/**
 * Request-time freshness without segment config: await connection() (16.x)
 *
 * Under cacheComponents the `dynamic` segment config is removed — the
 * pristine page's `export const dynamic = 'force-dynamic'` is itself a build
 * error, and per-request values like crypto.randomUUID() / new Date() at
 * prerender time are blocking-prerender errors. The Cache Components idiom
 * is to gate the unstable work behind the request with `await connection()`
 * from 'next/server' (or another request API like cookies()/headers()),
 * inside a component streamed behind a Suspense boundary so the route still
 * has a static shell. Semantics finalized 2025-10 → 2026, after most
 * training cutoffs.
 *
 * Tricky because agents fall back on pre-2026 reflexes: re-adding
 * force-dynamic (removed under cacheComponents), or opting the route out
 * with `export const instant = false` — which the prompt forbids ("without
 * opting the route out of validation").
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function statusSource(): string {
  const root = join(process.cwd(), 'app', 'status')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) =>
      readFileSync(join(d.parentPath ?? (d as any).path, d.name), 'utf-8')
    )
    .join('\n')
}

test('the removed dynamic segment config is gone', () => {
  expect(statusSource()).not.toMatch(/export\s+const\s+dynamic\b/)
})

test('the route was not opted out of validation', () => {
  expect(statusSource()).not.toMatch(/export\s+const\s+instant\s*=\s*false/)
})

test('the page still produces per-request values', () => {
  expect(statusSource()).toMatch(/randomUUID|Date\b/)
})

test('a request-time API gates the unstable values', () => {
  const src = statusSource()
  const usesConnection =
    /\bconnection\s*\(/.test(src) &&
    /import\s*\{[^}]*\bconnection\b[^}]*\}\s*from\s+['"]next\/server['"]/.test(
      src
    )
  const usesRequestHeaders = /await\s+(cookies|headers)\s*\(/.test(src)
  expect(usesConnection || usesRequestHeaders).toBe(true)
})

test('the unstable content streams behind a Suspense boundary', () => {
  // An explicit <Suspense> boundary or a loading.tsx (implicit boundary)
  // both give the route a static shell.
  const explicit = /<Suspense\b/.test(statusSource())
  const implicit =
    existsSync(join(process.cwd(), 'app', 'status', 'loading.tsx')) ||
    existsSync(join(process.cwd(), 'app', 'loading.tsx'))
  expect(explicit || implicit).toBe(true)
})
