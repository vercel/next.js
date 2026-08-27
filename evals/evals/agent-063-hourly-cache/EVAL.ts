/**
 * Hourly ISR translated to cacheComponents: 'use cache' + cacheLife
 *
 * Under cacheComponents (stable in v16, 2025-10) the `revalidate` segment
 * config is removed — a page that carries it fails the build. Hourly refresh
 * is now spelled 'use cache' (page-level or on the fetch helper) plus
 * cacheLife('hours') or cacheLife({ revalidate: 3600 }). This is the single
 * most common pre-2026 idiom (every ISR tutorial) flipping into a build
 * error.
 *
 * Tricky because agents must translate the intent, not delete the
 * constraint: simply removing `export const revalidate` drops the hourly
 * refresh, and the escape hatches (`export const dynamic`, `export const
 * instant = false`) give up the full prerender the prompt requires.
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

test('the removed revalidate segment config is gone', () => {
  for (const f of allSourceFiles('app/pricing')) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(
      /export\s+const\s+revalidate\b/
    )
  }
})

test('hourly refresh is expressed with use cache + cacheLife', () => {
  // Page-level directive or a cached fetch helper (in place or extracted to
  // lib/) are both correct.
  const files = [...allSourceFiles('app/pricing'), ...allSourceFiles('lib')]
  const cached = files.filter((f) =>
    /['"]use cache['"]/.test(readFileSync(f, 'utf-8'))
  )
  expect(cached.length).toBeGreaterThan(0)
  const withHourlyLife = files.filter((f) => {
    const content = readFileSync(f, 'utf-8')
    return (
      /cacheLife\s*\(/.test(content) &&
      (/['"]hours['"]/.test(content) ||
        /revalidate\s*:\s*(3600\b|60\s*\*\s*60\b)/.test(content))
    )
  })
  expect(withHourlyLife.length).toBeGreaterThan(0)
})

test('no escape hatches instead of caching', () => {
  for (const f of [...allSourceFiles('app'), ...allSourceFiles('lib')]) {
    const content = readFileSync(f, 'utf-8')
    expect(content).not.toMatch(/export\s+const\s+instant\s*=\s*false/)
    expect(content).not.toMatch(/export\s+const\s+dynamic\b/)
  }
})

test('the page still renders the pricing plans', () => {
  const pricingSource = allSourceFiles('app/pricing')
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n')
  expect(pricingSource).toMatch(/fetchPricing|plans\.map/)
})
