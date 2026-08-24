/**
 * Instant Validation
 *
 * Verifies that the agent opts the product route into Instant Validation and
 * produces a meaningful Cache Components shell: the stable title is available
 * immediately while live inventory streams behind a Suspense boundary.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function readRouteSource(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...readRouteSource(fullPath))
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(stripComments(readFileSync(fullPath, 'utf-8')))
    }
  }
  return files
}

const productRouteSource = readRouteSource(
  join(process.cwd(), 'app/product')
).join('\n---FILE---\n')

test('opts the product route into Instant Validation', () => {
  expect(productRouteSource).toMatch(
    /export\s+const\s+instant\s*=\s*(?:true|\{[\s\S]*?level\s*:\s*['"]warning['"][\s\S]*?\})/
  )
})

test('keeps the title in the shell while live inventory streams', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product route must produce meaningful instant UI with Cache Components, without relying on Partial Prefetching.

The product title "Premium Widget" must render in the product page's static shell, outside the Suspense boundary that contains the live inventory. The inventory count and price must render from an async child beneath that Suspense boundary, so the page returns its title and fallback without waiting for getInventory(). The runtime boundary in getInventory(), such as connection(), must be preserved; do not cache the randomized inventory or replace it with static values.

Accept equivalent component and file organization. Reject solutions where the page awaits inventory before returning, the title is hidden behind the inventory boundary, the live inventory is cached, or Partial Prefetching is used as a substitute for a valid instant shell.`
  )
})
