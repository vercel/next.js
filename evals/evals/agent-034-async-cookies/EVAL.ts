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
    `Next.js 16's cookies() and headers() (from 'next/headers') are async: they return Promises. In the app/ directory, the code must consume them correctly at runtime — every read of the cookie store or headers list operates on a resolved value, never on a pending Promise.

For reference, one correct solution:

  const [cookieStore, headersList] = await Promise.all([cookies(), headers()])
  const theme = cookieStore.get('theme')?.value
  const lang = headersList.get('accept-language')

Judge runtime correctness, not style: any form that resolves the promises before using the values is correct, even if unidiomatic or redundant.`
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
