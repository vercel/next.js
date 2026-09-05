/**
 * Bundler-compiled service workers (Turbopack, Next 16.3)
 *
 * Since 2026-07 Next.js compiles a TS service worker referenced via
 * navigator.serviceWorker.register(new URL('./worker', import.meta.url)):
 * it is bundled, served at a stable /_next/static/service-worker/ URL with
 * mutable caching (max-age=0 + ETag) and an automatic Service-Worker-Allowed
 * header. No public/ copy, no custom headers, no next-pwa.
 *
 * Tricky because every pre-2026-07 agent "knows" the answer is a hand-copied
 * public/sw.js (plus a copy step for TS) or a PWA package — both explicitly
 * ruled out by the prompt.
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

function appFiles(): string[] {
  const root = join(process.cwd(), 'app')
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => join(d.parentPath ?? (d as any).path, d.name))
}

function registrarSource(): string {
  return (
    appFiles()
      .map((f) => readFileSync(f, 'utf-8'))
      .find((c) => /serviceWorker/.test(c)) ?? ''
  )
}

test('registers the worker module via new URL(..., import.meta.url)', () => {
  const content = registrarSource()
  expect(content).toMatch(
    /serviceWorker\s*\.?\s*register\s*\(\s*new\s+URL\s*\(/
  )
  expect(content).toMatch(/import\.meta\.url/)
  expect(content).toMatch(/offline-worker/)
  expect(content).not.toMatch(/register\s*\(\s*['"]\/sw\.js['"]/)
})

test('no hand-copied worker in public/', () => {
  const pub = join(process.cwd(), 'public')
  if (existsSync(pub)) {
    const files = readdirSync(pub, { recursive: true }) as string[]
    expect(
      files.filter((f) => /sw.*\.js$|worker.*\.js$/.test(String(f)))
    ).toEqual([])
  }
})

test('no extra build step or PWA package added', () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
  )
  expect(pkg.scripts.build).toBe('next build')
  const allDeps = JSON.stringify({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })
  expect(allDeps).not.toMatch(/next-pwa|serwist|workbox/)
})

test('the TypeScript worker module still exists', () => {
  expect(existsSync(join(process.cwd(), 'lib', 'offline-worker.ts'))).toBe(true)
})
