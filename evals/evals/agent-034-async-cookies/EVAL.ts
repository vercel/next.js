/**
 * Async Cookies/Headers
 *
 * Tests whether the agent awaits cookies() and headers() calls, which became
 * async in Next.js 16 (breaking change from synchronous access in Next.js 15).
 *
 * Tricky because agents trained on Next.js 15 call cookies()/headers()
 * synchronously — Next.js 16 removed synchronous access entirely.
 *
 * The awaited-correctly check is semantic, so it uses the agentic LLM judge
 * rather than regex. The old /await\s+cookies\(\)/ regex only matched the naive
 * `await cookies()` form and rejected correct (arguably better) code like
 * `await Promise.all([cookies(), headers()])`, and its no-sync-call lookbehind
 * wrongly flagged the bare `cookies()` inside that array. The judge reasons
 * about whether the promises are actually awaited before use, whatever the form.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

function readAppFiles(): string {
  const appDir = join(process.cwd(), 'app')
  if (!existsSync(appDir)) return ''
  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const files = entries.filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  return files.map((f) => readFileSync(join(appDir, f), 'utf-8')).join('\n')
}

test('cookies() and headers() are consumed as async APIs', async () => {
  await expect(environment).toSatisfyCriterion(
    `In the app/ directory, every call to Next.js's cookies() and headers() (from 'next/headers') has its returned promise awaited before the value is used. Nothing treats the return value as a synchronous store.

For reference, each of these consumptions is CORRECT (any one of them, or an equivalent, passes):

  const cookieStore = await cookies()
  const headersList = await headers()
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()])

Note the bare cookies() inside Promise.all([...]) IS correctly awaited — the await applies to the whole array. Do not fail it.

This is WRONG (fails the criterion) — using the value without awaiting:

  const cookieStore = cookies() // no await
  const theme = cookieStore.get('theme') // .get() on a Promise`
  )
})

test('Component reads theme cookie', () => {
  const content = readAppFiles()

  // Should read "theme" cookie
  expect(content).toMatch(/['"]theme['"]/)

  // Should use .get() method on cookie store
  expect(content).toMatch(/\.get\s*\(/)
})

test('Component reads Accept-Language header', () => {
  const content = readAppFiles()

  // Should read Accept-Language header
  expect(content).toMatch(/accept-language/i)
})
