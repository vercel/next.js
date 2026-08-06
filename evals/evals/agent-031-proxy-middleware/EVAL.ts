/**
 * Proxy (formerly Middleware)
 *
 * Tests whether the agent creates proxy.ts with a proxy() function (Next.js
 * 16+ convention) instead of the deprecated middleware.ts/middleware().
 *
 * Tricky because agents trained on pre-16 data create middleware.ts with a
 * middleware() function — the file and function were both renamed in Next.js 16.
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

test('Proxy imports NextResponse from next/server', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // Should import NextResponse from next/server
    expect(content).toMatch(/import.*NextResponse.*from\s+['"]next\/server['"]/)
  }
})

test('Proxy adds custom header X-Request-Id', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // Should use NextResponse.next()
    expect(content).toMatch(/NextResponse\.next\(\)/)

    // Should set X-Request-Id header
    expect(content).toMatch(/['"]X-Request-Id['"]/i)

    // Should return response
    expect(content).toMatch(/return\s+/)
  }
})

test('Proxy logs request pathname', () => {
  const proxyPath = join(process.cwd(), 'proxy.ts')
  if (existsSync(proxyPath)) {
    const content = readFileSync(proxyPath, 'utf-8')

    // Should log pathname
    expect(content).toMatch(/console\.log.*pathname|pathname.*console\.log/)
  }
})
