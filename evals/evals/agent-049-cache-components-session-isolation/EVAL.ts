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

test('keeps member data isolated and the shell meaningful', async () => {
  await expect(environment).toSatisfyCriterion(
    `The dashboard keeps a useful stable frame such as the Workspace heading outside a meaningful Suspense boundary. Member name, team cookie, and request-region header are read at request time in the suspended subtree and are not captured by a public cache. Shared project totals are cached in a small data function with an explicit lifetime. No page or broad request-specific component is publicly cached, so values cannot leak between members.`
  )
})
