/**
 * connection() for Dynamic Rendering
 *
 * Tests whether the agent uses connection() from next/server to force dynamic
 * rendering instead of the deprecated unstable_noStore().
 *
 * Tricky because agents use unstable_noStore(), force-dynamic segment config,
 * or unrelated Dynamic APIs instead of the stable connection() function.
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

test('Component imports connection from next/server', () => {
  const content = readAppFiles()

  // Should import connection from next/server
  expect(content).toMatch(/import.*connection.*from\s+['"]next\/server['"]/)
})

test('Component uses await connection()', () => {
  const content = readAppFiles()

  // connection() returns a Promise and must be awaited
  expect(content).toMatch(/await\s+connection\s*\(\s*\)/)
})

test('Component is async', () => {
  const content = readAppFiles()

  // Component must be async to use await
  expect(content).toMatch(/async\s+function|export\s+default\s+async/)
})

test('Component uses Date for timestamp', () => {
  const content = readAppFiles()

  // Should use Date for generating timestamp
  expect(content).toMatch(/new\s+Date\s*\(|Date\.now\s*\(/)
})

test('Does NOT use unstable_noStore (deprecated)', () => {
  const content = readAppFiles()

  // Should NOT use deprecated unstable_noStore
  expect(content).not.toMatch(/unstable_noStore/)
})

test('Does NOT use force-dynamic segment config as primary approach', () => {
  const content = readAppFiles()

  // Should use connection() as the primary approach instead of segment config
  const hasForceDynamic =
    content.includes("dynamic = 'force-dynamic'") ||
    content.includes('dynamic = "force-dynamic"')
  const hasConnection = /connection\s*\(\s*\)/.test(content)

  // Enforce that connection() is the primary dynamic approach
  // If force-dynamic is used, it cannot be the only dynamic mechanism
  // When connection() is available/used, force-dynamic should not be redundantly added
  if (hasForceDynamic && !hasConnection) {
    // force-dynamic is being used as the sole dynamic mechanism (wrong)
    expect.fail(
      'force-dynamic segment config should not be the primary approach - use connection() instead'
    )
  }
})
