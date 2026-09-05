/**
 * Instant title via static-shell restructuring (agent-040-instant, reworked)
 *
 * Pristine bug: app/product/page.tsx awaits `getInventory()` (which awaits
 * `connection()`) before returning any JSX, so the static `<h1>` is blocked
 * behind request-time data. Under `cacheComponents: true` the build itself
 * fails with the blocking-prerender-dynamic error, whose fix menu offers
 * [stream] `<Suspense>` around the data access, [cache] `"use cache"` (not
 * applicable to `connection()`), and [block] `export const instant = false`.
 *
 * Only [stream] satisfies the prompt: restructure so the title lives in the
 * prerendered shell and the inventory streams at request time. Any form is
 * accepted — inline `<Suspense>` around an async child, a separate component
 * file, or hoisting the await — because acceptance is behavioral: after a
 * real `next build`, the /product shell HTML must contain the title, must
 * NOT contain the inventory content, and must still carry a streamed hole
 * (`<template id="B:` postpone fingerprint, same fingerprint documented in
 * agent-065). The tempting escapes each fail a behavioral gate:
 * - `export const instant = false` (the [block] hint): build passes but the
 *   shell has no title → the title assertion fails. (`instant` configures
 *   instant-navigation validation/blocking-route permission only — it does
 *   not make anything instant. See instant-config.tsx.)
 * - caching the inventory ([cache]): `connection()` is disallowed inside
 *   cache scopes, and dropping `connection()` to cache the lookup violates
 *   "fetched fresh on every request" — the shell would contain the stock
 *   line → the not-prerendered assertion fails.
 * - deleting the inventory from the page: the source must still render it
 *   (loose source check) and the shell must still have a dynamic hole.
 *
 * History: the previous version of this EVAL required `export const
 * instant` plus a `prefetch: 'static'` literal. `prefetch: 'static'` is not
 * a real API (valid values: auto | partial | unstable_eager |
 * force-disabled, app-segment-config.ts), and `instant` does not enable
 * instant navigation — that acceptance failed the semantically correct fix.
 *
 * Verified on next 16.4.0-canary.10:
 * - pristine: `next build` exits 1 (blocking-prerender-dynamic on /product).
 * - oracle (title outside `<Suspense>`, inventory inside): build green;
 *   .next/server/app/product.html contains "Premium Widget", no "in stock"
 *   outside <script> payloads, and a `<template id="B:` hole.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, expect, test } from 'vitest'

const HTML_PATH = join(process.cwd(), '.next', 'server', 'app', 'product.html')

beforeAll(() => {
  rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })
  const env: Record<string, string | undefined> = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  }
  // vitest sets NODE_ENV=test, which breaks next build
  delete env.NODE_ENV
  execSync('npx next build', {
    stdio: 'pipe',
    env: env as unknown as NodeJS.ProcessEnv,
    timeout: 600_000,
  })
}, 800_000)

/** Shell HTML with inlined <script> payloads removed, so assertions only see
 * what a crawler/user sees before hydration or streaming. */
function visibleShell(): string {
  return readFileSync(HTML_PATH, 'utf-8').replace(
    /<script[\s\S]*?<\/script>/g,
    ' '
  )
}

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map((d) => ({ d, p: join(d.parentPath ?? (d as any).path, d.name) }))
    .filter(
      ({ d, p }) =>
        d.isFile() &&
        /\.(ts|tsx)$/.test(d.name) &&
        !p.includes('node_modules') &&
        !p.includes('.next') &&
        !p.includes('__agent_eval__')
    )
    .map(({ p }) => p)
}

function appAndLibSource(): string {
  return [...allSourceFiles('app'), ...allSourceFiles('lib')]
    .map((f) => readFileSync(f, 'utf-8'))
    .join('\n')
}

test('the product title is in the prerendered shell (appears immediately on navigation)', () => {
  expect(existsSync(HTML_PATH)).toBe(true)
  expect(visibleShell()).toContain('Premium Widget')
})

test('the inventory is not prerendered — it still streams at request time', () => {
  const shell = visibleShell()
  // Stock content must not be baked into the shared shell...
  expect(shell).not.toMatch(/in stock/i)
  // ...and the shell must still contain a streamed hole where it resolves
  // later (React postpone fingerprint for a pending boundary).
  expect(readFileSync(HTML_PATH, 'utf-8')).toContain('<template id="B:')
})

test('the page still renders live inventory from the connection-gated source', () => {
  const source = appAndLibSource()
  // The request-time gate survives (not cached away)...
  expect(source).toMatch(/connection\s*\(/)
  // ...and the stock line is still rendered somewhere.
  expect(source).toMatch(/in stock/i)
})
