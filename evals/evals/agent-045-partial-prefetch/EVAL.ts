/**
 * Partial Prefetching opt-in ('export const prefetch = "partial"')
 *
 * A <Link prefetch={true}> to a route with personalized (cookie-derived)
 * content ships that content in the prefetch response. The correct fix keeps
 * the eager link but opts the destination segment into Partial Prefetching
 * with `export const prefetch = 'partial'`, which downgrades full prefetches
 * so dynamic data never rides in a prefetch response.
 *
 * Tricky because (a) the API is 16.3-era (2026), and (b) between 2026-02 and
 * 2026-08 the `instant` segment config implied this behavior — it was then
 * decoupled (#96539), so agents with mid-2026 knowledge reach for
 * `export const instant`, which today does nothing to prefetches. Pre-2026
 * agents delete prefetch={true} instead, losing eager static prefetch.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function accountFiles(): string[] {
  const root = join(process.cwd(), 'app', 'account')
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

test('config keeps cacheComponents enabled', () => {
  expect(read('next.config.ts')).toMatch(/cacheComponents\s*:\s*true/)
})

test('the account segment opts into partial prefetching', () => {
  const withPartial = accountFiles().filter((f) =>
    /export\s+const\s+prefetch\s*=\s*['"]partial['"]/.test(
      readFileSync(f, 'utf-8')
    )
  )
  expect(withPartial.length).toBeGreaterThan(0)
})

test('the link keeps eager prefetching', () => {
  const home = read('app/page.tsx')
  expect(home).toMatch(/prefetch=\{?true\}?/)
  expect(home).not.toMatch(/prefetch=\{?false\}?/)
})

test('does not reach for instant (which no longer affects prefetching)', () => {
  for (const f of accountFiles()) {
    expect(readFileSync(f, 'utf-8')).not.toMatch(/export\s+const\s+instant\b/)
  }
})

test('balance is still cookie-derived server content', () => {
  const account = read('app/account/page.tsx')
  expect(account).toMatch(/cookies\s*\(/)
  expect(account).not.toMatch(/['"]use client['"]/)
})
