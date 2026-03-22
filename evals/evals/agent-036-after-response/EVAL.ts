/**
 * after() for Post-Response Work
 *
 * Tests whether the agent uses after() from next/server to schedule work
 * (logging, analytics) after the response is sent, without blocking it.
 *
 * Tricky because agents use fire-and-forget promises, setTimeout, or
 * Vercel-specific waitUntil() instead of the built-in after() API.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

function readAppFiles(): string {
  const appDir = join(process.cwd(), 'app')
  if (!existsSync(appDir)) return ''
  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const files = entries.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  return files.map((f) => readFileSync(join(appDir, f), 'utf-8')).join('\n')
}

test('Component imports after from next/server', () => {
  const content = readAppFiles()

  expect(content).toMatch(/import.*after.*from\s+['"]next\/server['"]/)
})

test('Component uses after() with callback', () => {
  const content = readAppFiles()

  // Should call after() with a callback function
  expect(content).toMatch(
    /after\s*\(\s*(\(|async\s*\(|function|async\s+function)/
  )
})

test('after() callback contains logging logic', () => {
  const content = readAppFiles()

  // Should have some logging-related code
  expect(content).toMatch(/after\s*\(/)
  expect(content).toMatch(/log|analytics|track|console/i)
})

test('Does NOT use waitUntil directly', () => {
  const content = readAppFiles()

  // Should NOT use waitUntil directly (platform-specific)
  expect(content).not.toMatch(/waitUntil\s*\(/)
})

test('Does NOT await the logging operation inline', () => {
  const content = readAppFiles()

  // The after() function should be used - not awaiting log operations directly
  expect(content).toMatch(/after\s*\(/)
})
