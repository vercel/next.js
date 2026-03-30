/**
 * Indirect Proxy (Request Logging)
 *
 * Tests whether the agent creates proxy.ts to log all requests — without the
 * prompt mentioning "proxy" or "middleware." The agent must infer that request
 * interception requires the proxy layer.
 *
 * Tricky because unlike agent-031 which explicitly asks for middleware, this
 * only asks to "log every request" — the agent must know proxy.ts is the
 * right tool, and use the Next.js 16 convention (not middleware.ts).
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

test('proxy.ts file exists in root (Next.js 16+ convention)', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  const middlewarePath = join(process.cwd(), 'middleware.ts')

  // In Next.js 16+, the file should be named proxy.ts, not middleware.ts
  // middleware.ts is deprecated
  const hasProxy = existsSync(proxyPath)
  const hasMiddleware = existsSync(middlewarePath)

  // Must have proxy.ts
  expect(hasProxy).toBe(true)

  // Should NOT have middleware.ts (deprecated)
  expect(hasMiddleware).toBe(false)
})

test('Proxy function uses correct name (not middleware)', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // In Next.js 16+, the function should be named 'proxy', not 'middleware'
    // Should export proxy function
    expect(content).toMatch(
      /export\s+(async\s+)?(default\s+)?function\s+proxy|export\s+default\s+async\s+function\s+proxy/
    )

    // Should NOT have a function named 'middleware'
    expect(content).not.toMatch(/export\s+(default\s+)?function\s+middleware/)
  }
})

test('Proxy imports from next/server', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // Should import from next/server
    expect(content).toMatch(/from\s+['"]next\/server['"]/)
  }
})

test('Proxy logs request to console', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // Should have console.log
    expect(content).toMatch(/console\.log/)

    // Should reference the request somehow (url, pathname, nextUrl, etc.)
    expect(content).toMatch(/request|req|url|pathname|nextUrl/i)
  }
})
