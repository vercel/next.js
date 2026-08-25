/**
 * Empty generateStaticParams is a build error under Cache Components (E394)
 *
 * Since 2026-06 (#95269), with cacheComponents every generateStaticParams
 * must return at least one result — `return []` flipped from "valid, just no
 * prerenders" to a hard build failure. The sanctioned fix keeps GSP and
 * guarantees a non-empty result (e.g. a placeholder param when the source is
 * empty). The build gate does the heavy lifting here; these assertions block
 * the escape hatches.
 *
 * Tricky because pre-2026 agents "know" returning [] is fine, and their
 * next reflexes — deleting generateStaticParams, or force-dynamic (removed
 * under cacheComponents) — are blocked below / by the build.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function docsFiles(): string[] {
  const root = join(process.cwd(), 'app', 'docs')
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

function docsSource(): string {
  return docsFiles()
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n')
}

test('generateStaticParams still exists on the docs route', () => {
  expect(docsSource()).toMatch(/generateStaticParams/)
})

test('the CMS listing is still consulted (prerendering kept when content exists)', () => {
  expect(docsSource()).toMatch(/fetchDocSlugs/)
})

test('the route was not opted out of validation', () => {
  // Ban actual opt-out declarations, not mere mentions in comments.
  expect(docsSource()).not.toMatch(/export\s+const\s+instant\s*=\s*false/)
  expect(docsSource()).not.toMatch(/export\s+const\s+dynamicParams\b/)
  expect(docsSource()).not.toMatch(/dynamic\s*=\s*['"]force-dynamic['"]/)
})

test('the flaky-CI symptom is handled in code, not by deleting the route', () => {
  expect(
    existsSync(join(process.cwd(), 'app', 'docs', '[slug]', 'page.tsx'))
  ).toBe(true)
})
