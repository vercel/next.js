/**
 * "Cache forever" is spelled Infinity (cacheLife normalization, 2026-07)
 *
 * Since #95493 (2026-07), { stale/revalidate/expire: Infinity } is the
 * documented cache-forever spelling, validated and prerenderable. The
 * built-in 'max' profile is NOT forever — its expire is one year
 * (config-shared.ts: max.expire = 60*60*24*365) — and magic epoch numbers
 * are exactly the workaround the normalization was shipped to replace.
 *
 * Tricky because pre-2026-07 agents "know" Infinity isn't a valid config
 * value and reach for cacheLife('max') or 31536000-style constants.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function combined() {
  return read('lib/changelog.ts') + '\n' + read('next.config.ts')
}

test('expire is Infinity (truly forever)', () => {
  expect(combined()).toMatch(/expire\s*:\s*Infinity/)
})

test('does not settle for the one-year max profile', () => {
  expect(read('lib/changelog.ts')).not.toMatch(/cacheLife\(\s*['"]max['"]\s*\)/)
})

test('no magic epoch numbers', () => {
  expect(combined()).not.toMatch(/31536000|8760|525600|315360000/)
})

test('still cached and still using the framework cache', () => {
  const lib = read('lib/changelog.ts')
  expect(lib).toMatch(/['"]use cache['"]/)
  expect(lib).toMatch(/cacheLife/)
})
