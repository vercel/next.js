/**
 * Node APIs in the request interceptor (proxy.ts, Node-only since Next 16)
 *
 * The task requires Node's crypto (createHmac + timingSafeEqual) before a
 * route renders. Since Next.js 16 the interception file is proxy.ts and it
 * always runs on the Node.js runtime — Node APIs are simply available, and
 * any runtime segment config in the file is a build error.
 *
 * Tricky because pre-16 agents "know" middleware is edge-only: they write
 * middleware.ts (deprecated), avoid Node crypto in favor of crypto.subtle
 * contortions, declare it impossible, or add a runtime config export
 * (which fails the build in proxy.ts).
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

function proxySource(): string {
  for (const name of ['proxy.ts', 'proxy.js', 'src/proxy.ts']) {
    const p = join(process.cwd(), name)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  }
  return ''
}

test('proxy file exists and deprecated middleware file does not', () => {
  const hasProxy =
    existsSync(join(process.cwd(), 'proxy.ts')) ||
    existsSync(join(process.cwd(), 'src/proxy.ts'))
  expect(hasProxy).toBe(true)
  expect(existsSync(join(process.cwd(), 'middleware.ts'))).toBe(false)
  expect(existsSync(join(process.cwd(), 'src/middleware.ts'))).toBe(false)
})

test('exports a function named proxy (or default), not middleware', () => {
  const content = proxySource()
  expect(content).toMatch(
    /export\s+(default\s+)?(async\s+)?function\s+proxy|export\s+default\s+(async\s+)?function|export\s+\{\s*\w+\s+as\s+proxy\s*\}|export\s+const\s+proxy\s*=/
  )
  expect(content).not.toMatch(
    /export\s+(default\s+)?(async\s+)?function\s+middleware/
  )
})

test('uses Node crypto with a timing-safe comparison', () => {
  const content = proxySource()
  expect(content).toMatch(
    /from\s+['"](node:)?crypto['"]|require\(\s*['"](node:)?crypto['"]\s*\)/
  )
  expect(content).toMatch(/createHmac/)
  expect(content).toMatch(/timingSafeEqual/)
})

test('does not configure a runtime (proxy is Node-only, config would fail the build)', () => {
  const content = proxySource()
  expect(content).not.toMatch(/runtime\s*:\s*['"]/)
  expect(content).not.toMatch(/export\s+const\s+runtime\b/)
})

test('scopes to /admin and redirects failures to /denied', () => {
  const content = proxySource()
  expect(content).toMatch(/\/admin/)
  expect(content).toMatch(/\/denied/)
})
