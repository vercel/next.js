/**
 * Enable PPR
 *
 * Tests whether the agent knows that partial pre-rendering is enabled via
 * `cacheComponents: true` in next.config.ts, NOT the old
 * `experimental: { ppr: true }` flag.
 *
 * Tricky because most training data and older docs reference the experimental
 * flag. The current way to enable PPR in Next.js 16 is `cacheComponents: true`.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('Enables PPR via cacheComponents in next.config', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('Does not use the old experimental.ppr flag', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  // Strip comments to avoid false positives from explanatory comments
  const stripped = config
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  expect(stripped).not.toMatch(/ppr\s*:\s*true/)
})
