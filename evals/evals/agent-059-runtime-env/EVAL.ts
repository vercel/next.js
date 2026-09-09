/**
 * Runtime environment variables under cacheComponents (v16)
 *
 * NEXT_PUBLIC_ variables are inlined into the bundle AT BUILD TIME, so a
 * Docker image promoted from staging to production can never change them.
 * v16 (2025-10) removed runtimeConfig; the sanctioned pattern is a
 * server-side process.env read at request time. Under cacheComponents that
 * means awaiting connection() before the read (behind a Suspense boundary),
 * because a read during prerender would bake the build-time value into the
 * static shell — the same bug in a different place.
 *
 * Tricky because agents trained on pre-2026 data rename the variable, add a
 * config-level `env` block (also build-time inlining), or reach for the
 * removed runtimeConfig — all of which keep the values frozen in the image.
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

test('config keeps cacheComponents enabled and adds no build-time env block', () => {
  const config = read('next.config.ts')
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/\benv\s*:\s*\{/)
})

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

test('the build-time-inlined NEXT_PUBLIC_ variables are gone', () => {
  for (const f of [...allSourceFiles('app'), ...allSourceFiles('lib')]) {
    expect(stripComments(readFileSync(f, 'utf-8'))).not.toMatch(
      /NEXT_PUBLIC_SUPPORT_EMAIL|NEXT_PUBLIC_API_BASE/
    )
  }
})

test('the values are read from process.env in server code', () => {
  const readers = [...allSourceFiles('app'), ...allSourceFiles('lib')].filter(
    (f) => {
      const content = readFileSync(f, 'utf-8')
      return (
        !/['"]use client['"]/.test(content) &&
        (/process\.env(\.|\[['"])(SUPPORT_EMAIL|API_BASE)/.test(content) ||
          /\{[^}]*\b(SUPPORT_EMAIL|API_BASE)\b[^}]*\}\s*=\s*process\.env/.test(
            content
          ))
      )
    }
  )
  expect(readers.length).toBeGreaterThan(0)
})

test('the env read happens at request time, not during prerender', () => {
  // Under cacheComponents a request-time API must gate the read — a
  // Suspense boundary alone still prerenders (and bakes) the value.
  const appAndLib = [...allSourceFiles('app'), ...allSourceFiles('lib')]
  const gated = appAndLib.some((f) =>
    /\b(connection|headers|cookies)\s*\(/.test(readFileSync(f, 'utf-8'))
  )
  expect(gated).toBe(true)
})
