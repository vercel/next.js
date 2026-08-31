/** Cache Components: request isolation and reusable data. */

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

test('introduces a bounded reusable cache', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(source).toMatch(/\bcacheLife\s*\(/)
})

test('keeps a useful dashboard frame in the shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The dashboard must keep a useful stable frame, such as the Workspace heading, outside the Suspense boundary used for request-specific member content. The boundary must provide visible, meaningful loading UI rather than a null or empty fallback. Accept equivalent component and file organization.`
  )
})

test('keeps member data isolated per request', async () => {
  await expect(environment).toSatisfyCriterion(
    `Member name, team cookie, and request-region header must be read at request time in the suspended subtree and must not be captured by a public cache. No page or broad request-specific component may be publicly cached. Reject any solution that can reuse one member's values for another member. Accept equivalent component and file organization.`
  )
})

test('caches only the shared project totals', async () => {
  await expect(environment).toSatisfyCriterion(
    `Shared project totals must be cached in a focused reusable data function with an explicit cache lifetime. The cache must not include member name, cookies, headers, or other request-specific values. Accept equivalent component and file organization.`
  )
})
