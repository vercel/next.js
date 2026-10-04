/**
 * Cache Components browser-only cache
 *
 * Verifies that an agent removes staleTimes and uses an expire: 0 public cache
 * profile when an RSC payload may be reused in the browser but not on the
 * server across requests.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set(['.git', '.next', 'node_modules'])
const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

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
      files.push(stripComments(readFileSync(fullPath, 'utf-8')))
    }
  }

  return files
}

const source = readSourceFiles(process.cwd()).join('\n---FILE---\n')
const config = stripComments(
  readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')
)

test('uses Cache Components without staleTimes', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).not.toMatch(/\bstaleTimes\s*:/)
})

test('uses an expire: 0 public cache profile', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(source).not.toMatch(/['"]use cache: private['"]/)
  expect(source).toMatch(
    /\bcacheLife\s*\(\s*\{[\s\S]*?\bexpire\s*:\s*0\b[\s\S]*?\}\s*\)/
  )
})

test('applies browser-only caching to the product payload', async () => {
  await expect(environment).toSatisfyCriterion(
    `The implementation must satisfy all of these requirements:

1. A public "use cache" boundary covers the server getProduct read and the rendered product name and price at /products/[id].
2. That same cache boundary calls cacheLife with expire: 0. This prevents production server-cache reuse across requests while allowing the Next.js client router to reuse the RSC payload for its inherited stale window.
3. The solution does not use "use cache: private". This fixture renders public data, reads no request APIs, and asks to keep the existing public cache boundary.
4. experimental.staleTimes is removed because Cache Components uses cacheLife for client cache reuse.
5. The product remains server-rendered at the existing route, and navigation continues to use Next.js Link and file-system routing. Reject native history APIs, window.location, static placeholder content, and moving the product read to a client-only request.

Reject cacheLife('max'), a positive expire value, cacheLife({ revalidate: 0 }) without expire: 0, or cacheLife({ expire: 0 }) in an unrelated helper that does not cover the product RSC payload. Judge equivalent file and component organization by behavior.`
  )
})
