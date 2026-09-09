/**
 * App-wide per-request caching via the default cacheLife profile override
 *
 * The correct answer is config-level: override the built-in `default`
 * cacheLife profile with `{ expire: 0 }` (next.config), which makes every
 * un-annotated 'use cache' a dynamic, per-request cache — without touching
 * call sites — while helpers can still opt into longer profiles inline.
 * The "default profile may be dynamic without tripping the nested-cacheLife
 * build error" exception landed 2026-07 (#95373).
 *
 * Tricky because agents either sed cacheLife({expire: 0}) into every helper
 * (explicitly forbidden by the prompt), delete 'use cache' entirely, or
 * reach for removed segment configs (revalidate/fetchCache are gone under
 * cacheComponents).
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

test('config overrides the default cacheLife profile to be per-request', () => {
  const config = read('next.config.ts')
  // Comments and formatting between keys are fine — assert the pieces
  // independently rather than with a bounded window.
  expect(config).toMatch(/cacheLife\s*:/)
  expect(config).toMatch(/default\s*:\s*\{[^}]*expire\s*:\s*0\b/)
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('helpers were not edited one by one', () => {
  const lib = read('lib/data.ts')
  const directives = lib.match(/['"]use cache['"]/g) ?? []
  expect(directives.length).toBe(3)
  expect(lib).not.toMatch(/cacheLife\s*\(/)
  expect(lib).not.toMatch(/['"]use cache: private['"]/)
})

test('caching was not simply removed', () => {
  const lib = read('lib/data.ts')
  expect(lib).toMatch(/['"]use cache['"]/)
  const page = read('app/page.tsx')
  expect(page).not.toMatch(/revalidate|fetchCache|force-dynamic/)
})
