/**
 * Cache Components navigation cache
 *
 * Verifies that an agent uses Cache Components primitives instead of
 * experimental staleTimes for dynamic route content.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set(['.git', '.next', 'node_modules'])
const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function readSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
    } else if (!IGNORE_FILES.has(entry) && /\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(readFileSync(fullPath, 'utf-8'))
    }
  }

  return files
}

const source = readSourceFiles(process.cwd()).join('\n---FILE---\n')
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('uses Cache Components without staleTimes', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/\bstaleTimes\s*:/)
})

test('caches the server product read for client reuse', () => {
  expect(source).toMatch(/['"]use cache['"]/)
})

test('preserves the product page and normal routing', async () => {
  await expect(environment).toSatisfyCriterion(
    `The app still renders both product name and price from server-provided product data at the existing /products/[id] route. Navigation continues to use Next.js Link and file-system routing. Reject native history APIs, static placeholder content, and moving product rendering to a client-only request.`
  )
})
