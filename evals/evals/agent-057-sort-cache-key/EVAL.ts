/**
 * Fix logic INSIDE a 'use cache' function without losing the cache
 *
 * The bug is plain (getCatalog accepts sort and never applies it), but the
 * fix must land inside the cached function: declared arguments participate
 * in the 'use cache' key, so ordering the items by `sort` inside the cache
 * gives each sort its own entry while the fetch stays cached. (Note: the
 * 2026-01 unused-args compiler change slices EXTRA call-site arguments
 * beyond the declared parameter list — declared params are always keyed.)
 *
 * Tricky because agents diagnose "same output for different params" as a
 * framework cache bug and reach for workarounds: deleting the 'use cache'
 * directive, forcing the route dynamic, opting out with instant = false,
 * or sorting in the page (outside the cache) — the last is semantically
 * fine but the banned ones lose caching instead of fixing the logic.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function appSource(): string {
  const root = join(process.cwd(), 'app')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) =>
      readFileSync(join(d.parentPath ?? (d as any).path, d.name), 'utf-8')
    )
    .join('\n')
}

test('the catalog fetch stays cached', () => {
  expect(read('lib/catalog.ts')).toMatch(/['"]use cache['"]/)
})

test('the cached function actually uses the sort argument', () => {
  const catalog = read('lib/catalog.ts')
  // Parameter plus at least one real use inside the body.
  const sortMentions = catalog.match(/\bsort\b/g) ?? []
  expect(sortMentions.length).toBeGreaterThanOrEqual(2)
  // And an actual ordering operation, not just a pass-through mention.
  expect(catalog).toMatch(/\.(sort|toSorted)\s*\(|sortBy|order/)
})

test('no force-dynamic escape hatch was added', () => {
  expect(appSource()).not.toMatch(/export\s+const\s+dynamic\b/)
})

test('no instant opt-out was added', () => {
  expect(appSource()).not.toMatch(/export\s+const\s+instant\s*=\s*false/)
})
