/**
 * Private caching of per-user data ('use cache: private')
 *
 * The fixture ships a public 'use cache' function that reads cookies() —
 * a build error under cacheComponents. The correct fix keeps the function
 * cached AND per-user by switching to 'use cache: private', which is allowed
 * to read cookies, is excluded from prerenders, and dedupes within a request.
 *
 * Tricky because agents trained on pre-2026 data either delete the directive,
 * hoist cookies() out and pass the session as an argument to a PUBLIC cache
 * (shared across users keyed only by value — a data-sharing hazard), or
 * reach for React.cache and lose the framework cache semantics entirely.
 * 'use cache: private' shipped 2025-07 and its dev/prod behavior was
 * finalized mid-2026, after most training cutoffs.
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

test('recommendations helper uses the private cache directive', () => {
  const files = [...allSourceFiles('lib'), ...allSourceFiles('app')]
  const withPrivate = files.filter((f) =>
    /['"]use cache: private['"]/.test(readFileSync(f, 'utf-8'))
  )
  expect(withPrivate.length).toBeGreaterThan(0)
})

test('cookies are still read inside the cached function file', () => {
  const files = [...allSourceFiles('lib'), ...allSourceFiles('app')]
  const privateFile = files.find((f) =>
    /['"]use cache: private['"]/.test(readFileSync(f, 'utf-8'))
  )
  expect(privateFile).toBeTruthy()
  const content = readFileSync(privateFile!, 'utf-8')
  expect(content).toMatch(/from\s+['"]next\/headers['"]/)
  expect(content).toMatch(/cookies\s*\(/)
})

test('no public "use cache" remains on per-user code', () => {
  // A bare 'use cache' (without ": private") keyed by a cookie-derived
  // argument would share one user's data with another. The quote-bounded
  // regex does not match 'use cache: private'.
  for (const f of [...allSourceFiles('lib'), ...allSourceFiles('app')]) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(/['"]use cache['"]/)
  }
})
