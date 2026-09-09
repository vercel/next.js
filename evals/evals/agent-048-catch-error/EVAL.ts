/**
 * Component-level error boundary with server retry (catchError, Next 16.3)
 *
 * The idiomatic answer is the `catchError` HOC from 'next/error': the
 * fallback receives (props, { error, reset, retry }) and `retry()` re-runs
 * the Server Component. Stabilized 2026-06 (#94623), after every current
 * model's cutoff.
 *
 * 2026-08-31 acceptance correction: a hand-rolled (or react-error-boundary)
 * client boundary whose retry path calls `router.refresh()` inside a
 * transition DOES re-run Server Components — `catchError`'s own retry is
 * implemented as startTransition(refresh + reset). The earlier version of
 * this EVAL banned that functionally-equivalent fix outright and its header
 * dismissed it as "remounts client state only", which is factually wrong.
 * Both shapes are now accepted; what still fails is what actually violates
 * the prompt: a boundary whose retry only resets client state (no server
 * re-run), or a route-level error.tsx (too coarse — takes down the page).
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function allSourceFiles(dir: string): string[] {
  const root = join(process.cwd(), dir)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

function sources(): string[] {
  return [...allSourceFiles('app'), ...allSourceFiles('lib')].map((f) =>
    readFileSync(f, 'utf-8')
  )
}

test('an error boundary with a server-rerun retry wraps the widget', () => {
  const all = sources().join('\n')

  // Path A (idiomatic): catchError from 'next/error' with retry() wired up.
  const usesCatchError =
    sources().some(
      (c) =>
        /import\s*\{[^}]*catchError[^}]*\}\s*from\s+['"]next\/error['"]/.test(
          c
        ) && /catchError\s*\(/.test(c)
    ) && /\bretry\b/.test(all)

  // Path B (equivalent): a hand-rolled or third-party client boundary whose
  // retry path triggers a server re-run via router.refresh() — refresh
  // re-fetches the route's Server Components; reset alone does not.
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  )
  const allDeps = JSON.stringify({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })
  const hasBoundaryImpl =
    /componentDidCatch|getDerivedStateFromError/.test(all) ||
    /react-error-boundary/.test(allDeps)
  const retryTriggersServerRerun = /\.refresh\s*\(\s*\)/.test(all)
  const usesManualBoundary = hasBoundaryImpl && retryTriggersServerRerun

  expect(usesCatchError || usesManualBoundary).toBe(true)
})

test('no route-level error file was added for the dashboard', () => {
  expect(existsSync(join(process.cwd(), 'app', 'dashboard', 'error.tsx'))).toBe(
    false
  )
  expect(existsSync(join(process.cwd(), 'app', 'error.tsx'))).toBe(false)
})

test('the widget still fetches stats on the server', () => {
  const page = readFileSync(
    join(process.cwd(), 'app', 'dashboard', 'page.tsx'),
    'utf-8'
  )
  expect(page).toMatch(/getStats/)
  expect(page).not.toMatch(/['"]use client['"]/)
})
