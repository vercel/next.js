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

test('preserves the hourly newsroom feed', async () => {
  await expect(environment).toSatisfyCriterion(
    `The newsroom feed must remain cached with an explicit approximately-hourly cache lifetime. A focused data-level cache is valid, and a page-level cache is also valid because the Newsroom page contains only the feed and stable framing with the same lifetime. Reject solutions that remove or materially change the feed's hourly refresh behavior.`
  )
})

test('keeps editor preview request-specific', async () => {
  await expect(environment).toSatisfyCriterion(
    `The editor preview must still read its cookie at request time outside every public cache. Place the request-specific preview below Suspense or equivalent meaningful loading UI while leaving useful stable preview framing in the static shell. Reject solutions that cache the cookie value, hide the entire preview page behind one fallback, or remove the request-specific behavior.`
  )
})
