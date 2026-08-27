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

test('keeps URL-specific rendering below useful boundaries', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product page returns useful route-independent shop framing before awaiting params or searchParams. The URL promises are forwarded into one or more children below meaningful Suspense fallbacks, where the slug and currency are resolved. Product lookup is cached in a small data function with every value that changes its output included in the cache key. Related products remain independently suspended and may stream. The solution does not hide the entire page behind one null or generic boundary.`
  )
})
