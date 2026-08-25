/**
 * Scoped static-shell opt-out: export const instant = false (16.3)
 *
 * Under cacheComponents, a page awaiting headers() outside Suspense fails
 * the build (blocking-route). When a route legitimately cannot be
 * prerendered AND product forbids loading fallbacks, the sanctioned fix is
 * `export const instant = false` on that segment — it exempts the route
 * from the static-shell requirement (highest-false-wins) without relaxing
 * validation elsewhere. Stabilized from unstable_instant 2026-06 (#94578).
 *
 * Tricky because pre-2026 reflexes are all blocked: dynamic='force-dynamic'
 * was removed under cacheComponents (build error), Suspense fallbacks are
 * forbidden by the prompt, and global validation-level changes relax the
 * whole app.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function read(p: string) {
  return readFileSync(join(process.cwd(), p), 'utf-8')
}

function adminSource(): string {
  const root = join(process.cwd(), 'app', 'admin')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => readFileSync(join(d.parentPath ?? (d as any).path, d.name), 'utf-8'))
    .join('\n')
}

test('the admin segment opts out with instant = false', () => {
  expect(adminSource()).toMatch(/export\s+const\s+instant\s*=\s*false/)
})

test('no loading fallbacks were added to admin', () => {
  expect(adminSource()).not.toMatch(/Suspense/)
  expect(existsSync(join(process.cwd(), 'app', 'admin', 'loading.tsx'))).toBe(
    false
  )
})

test('admin data code untouched and still request-bound', () => {
  const page = read('app/admin/page.tsx')
  expect(page).toMatch(/await\s+headers\s*\(/)
  expect(page).not.toMatch(/force-dynamic|use cache/)
})

test('validation was not relaxed globally', () => {
  const config = read('next.config.ts')
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/instantInsights|validationLevel/)
})

test('the rest of the app was not opted out', () => {
  const home = read('app/page.tsx')
  expect(home).not.toMatch(/instant\s*=\s*false/)
  const layout = read('app/layout.tsx')
  expect(layout).not.toMatch(/instant\s*=\s*false/)
})
