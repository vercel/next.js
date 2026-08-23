/**
 * Cache Components: route config semantics
 *
 * Verifies that adoption translates legacy configuration instead of deleting
 * behavior or silencing validation.
 */

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

test('enables the current Cache Components config only', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/dynamicIO\s*:/)
  expect(config).not.toMatch(/useCache\s*:/)
})

test('removes route opt-outs and incompatible segment config', () => {
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
  expect(source).not.toMatch(
    /export\s+(?:const|var|let)\s+(?:dynamic|revalidate|fetchCache)\s*=/
  )
})

test('preserves the hourly feed and request-specific preview', async () => {
  await expect(environment).toSatisfyCriterion(
    `The newsroom query is cached in a small async data function with an explicit approximately-hourly cache lifetime. The editor preview still reads its cookie at request time outside any public cache, is placed below Suspense or equivalent meaningful loading UI, and leaves useful stable preview framing in the static shell. Page components are not cached.`
  )
})
