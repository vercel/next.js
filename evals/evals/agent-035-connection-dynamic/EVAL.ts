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

test('keeps the operations frame useful while metadata loads', async () => {
  await expect(environment).toSatisfyCriterion(
    `The stable Operations navigation and page frame must remain outside the Suspense boundary used for request metadata. The boundary must provide visible, meaningful loading UI rather than a null or empty fallback. Accept equivalent component and file organization.`
  )
})

test('keeps request metadata fresh', async () => {
  await expect(environment).toSatisfyCriterion(
    `The request identifier, current time, and sampling value must remain request-specific. Render them in a focused async child that awaits io() or connection() before calling randomUUID, new Date or Date.now, and Math.random. Prefer io() unless the implementation specifically needs to wait for a real user request. Accept equivalent component and file organization.`
  )
})

test('does not reuse request metadata', async () => {
  await expect(environment).toSatisfyCriterion(
    `The request identifier, current time, and sampling value must not be cached, evaluated at module scope, or replaced with static values. Reject any solution that can reuse those values across requests. Accept equivalent component and file organization.`
  )
})
