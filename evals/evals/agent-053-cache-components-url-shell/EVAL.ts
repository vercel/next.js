/** Cache Components: URL data and shell boundaries. */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set(['.git', '.next', 'node_modules', 'dist', 'build'])

function readSource(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((entry) => {
    if (IGNORE_DIRS.has(entry)) return []
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return readSource(path)
    if (entry === 'EVAL.ts' || !/\.(ts|tsx|js|jsx)$/.test(entry)) return []
    return readFileSync(path, 'utf8')
  })
}

const source = readSource(process.cwd()).join('\n')
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

test('enables Cache Components without opt-outs', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
})

test('keeps a useful shop frame in the static shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product page must return useful route-independent shop framing before awaiting params or searchParams. The solution must not hide the entire page behind one null, empty, or generic Suspense boundary. Accept equivalent component and file organization.`
  )
})

test('resolves URL data below meaningful boundaries', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product page must forward the params and searchParams promises into one or more children below meaningful Suspense fallbacks, where the product slug and currency are resolved. Reject solutions that await either URL promise before returning the useful shop frame. Accept equivalent component and file organization.`
  )
})

test('keys reusable product details by every input', async () => {
  await expect(environment).toSatisfyCriterion(
    `Product lookup must be cached in a focused reusable data function. Every value that can change its output, including the product slug and currency, must be passed into the cached function so it participates in the cache key. Reject broad page caching or a cache that can return one product or currency for another. Accept equivalent component and file organization.`
  )
})

test('streams related products independently', async () => {
  await expect(environment).toSatisfyCriterion(
    `Related products must remain behind their own meaningful Suspense boundary so they can stream independently after the primary product details. Reject solutions that block the primary details on related products or combine the whole page under one fallback. Accept equivalent component and file organization.`
  )
})
