/** Cache Components: synchronous request-time I/O in shared UI. */

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

test('uses an explicit synchronous I/O boundary', () => {
  expect(source).toMatch(/\b(?:io|connection)\s*\(/)
  expect(source).toMatch(/<Suspense[\s>]/)
})

test('preserves fresh metadata without sacrificing the shared frame', async () => {
  await expect(environment).toSatisfyCriterion(
    `The stable Operations navigation and page frame remain outside the Suspense boundary. The request metadata is rendered in a focused async child that awaits io() or connection() before calling new Date or Date.now, Math.random, and randomUUID, so those values remain request-specific. The metadata subtree is not cached or evaluated at module scope, and it has meaningful loading UI. Prefer io() unless the implementation specifically needs to wait for a real user request.`
  )
})
