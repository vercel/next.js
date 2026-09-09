/**
 * Module-scope promise dedupe inside 'use cache' → E236 prerender timeout
 *
 * 'use cache' already dedupes per-arguments within a request and across
 * concurrent requests — an outer module-scope promise map is redundant, and
 * worse: it makes the cache fill await a promise created in the outer render
 * scope, which can never settle during prerender, so the build dies with
 * "Filling a cache during prerender timed out" (E236). The dev-only E1181
 * probe (2026-05, currently skipped) named exactly this hazard: module-scope
 * in-flight maps around cached functions.
 *
 * Tricky because the E236 message misleadingly suggests request-data misuse
 * inside the cache, so agents bump timeouts in next.config.ts or wrap the
 * fill in try/catch instead of deleting the redundant dedupe layer.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

test('the deals helper is still cached', () => {
  expect(read('lib/deals.ts')).toMatch(/['"]use cache['"]/)
})

test('the module-scope in-flight promise map is out of the cached path', () => {
  // Any of these is a correct fix: delete the dedupe module, rewrite it
  // without a module-scope promise map, or stop routing the cached function
  // through it (the directive already dedupes concurrent identical calls).
  const requestPath = join(process.cwd(), 'lib', 'request.ts')
  const requestDeleted = !existsSync(requestPath)
  // A plain-object rewrite ({} keyed by string) keeps the hazard, so the
  // shared-promise store must be gone in any spelling.
  const mapGone =
    !requestDeleted &&
    !/new\s+(Map|WeakMap)\b|\binflight\b|\bin_?flight\b/i.test(
      readFileSync(requestPath, 'utf-8')
    )
  const importGone = !/from\s+['"]\.\/request['"]/.test(read('lib/deals.ts'))
  expect(requestDeleted || mapGone || importGone).toBe(true)
})

test('no timeout workarounds in config', () => {
  const config = read('next.config.ts')
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/useCacheTimeout|staticPageGenerationTimeout/)
})

