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
  expect(source).toMatch(/\bconnection\s*\(/)
  expect(source).toMatch(/<Suspense[\s>]/)
})

test('keeps the frame useful and metadata request-specific', async () => {
  await expect(environment).toSatisfyCriterion(
    `The stable Operations navigation and page frame remain outside the Suspense boundary used for request metadata. Inside that focused async boundary, the implementation awaits connection() before generating the request identifier, current time, and sampling value with randomUUID, new Date or Date.now, and Math.random. None of those values are cached, evaluated at module scope, or replaced with static values, so they are generated for each real request rather than during prerendering or prefetching. Accept equivalent component and file organization.`
  )
})
