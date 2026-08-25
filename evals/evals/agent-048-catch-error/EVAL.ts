/**
 * Component-level error boundary with server retry (catchError, Next 16.3)
 *
 * The correct answer is the `catchError` HOC from 'next/error': the fallback
 * receives (props, { error, reset, retry }) and `retry()` refetches — it
 * re-runs the Server Component, unlike `reset()` which only clears client
 * state. Stabilized 2026-06 (#94623), after every current model's cutoff.
 *
 * Tricky because agents hand-roll a class componentDidCatch boundary (or
 * reach for react-error-boundary) plus router.refresh(), or add error.tsx —
 * all of which either remount client state only or take down the whole route.
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

test('uses catchError from next/error', () => {
  const withCatchError = sources().filter(
    (c) =>
      /import\s*\{[^}]*catchError[^}]*\}\s*from\s+['"]next\/error['"]/.test(
        c
      ) && /catchError\s*\(/.test(c)
  )
  expect(withCatchError.length).toBeGreaterThan(0)
})

test('the fallback wires up retry (server re-run), not just reset', () => {
  const all = sources().join('\n')
  expect(all).toMatch(/\bretry\b/)
})

test('no route-level error file was added for the dashboard', () => {
  expect(existsSync(join(process.cwd(), 'app', 'dashboard', 'error.tsx'))).toBe(
    false
  )
  expect(existsSync(join(process.cwd(), 'app', 'error.tsx'))).toBe(false)
})

test('no hand-rolled or third-party error boundary', () => {
  const all = sources().join('\n')
  expect(all).not.toMatch(/componentDidCatch|getDerivedStateFromError/)
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  )
  const allDeps = JSON.stringify({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })
  expect(allDeps).not.toMatch(/react-error-boundary/)
})

test('the widget still fetches stats on the server', () => {
  const page = readFileSync(
    join(process.cwd(), 'app', 'dashboard', 'page.tsx'),
    'utf-8'
  )
  expect(page).toMatch(/getStats/)
  expect(page).not.toMatch(/['"]use client['"]/)
})
