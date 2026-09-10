/**
 * Optimize one Partial Prefetching navigation
 *
 * The fixture starts after Cache Components and Partial Prefetching adoption.
 * The agent must turn one accepted, URL-specific product goal into an
 * instant() RED-to-GREEN loop without expanding the cost to every card.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { environment, transcript } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])

function readSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  return readdirSync(dir).flatMap((entry) => {
    if (IGNORE_DIRS.has(entry)) return []
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return readSourceFiles(path)
    if (entry === 'EVAL.ts' || !/\.(ts|tsx|js|jsx)$/.test(entry)) return []
    return readFileSync(path, 'utf-8')
  })
}

const source = readSourceFiles(process.cwd()).join('\n')

test('keeps Cache Components and Partial Prefetching enabled', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(config).toMatch(/partialPrefetching\s*:\s*true/)
})

test('adds a click-driven instant navigation regression test', () => {
  expect(source).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(source).toMatch(/\binstant\s*\(/)
  expect(source).toMatch(/\.click\s*\(/)
})

test('adds reusable cached work', () => {
  expect(source).toMatch(/['"]use cache['"]/)
})

test('uses the navigation stage', () => {
  expect(source).toMatch(/\b(?:unstable_)?navigation\s*\(/)
})

test('optimizes only the selected featured navigation', async () => {
  await expect(environment).toSatisfyCriterion(
    `Only the featured Aurora keynote Link from /sessions opts into per-link prefetching with prefetch={true} or the equivalent bare prefetch prop. The other session-card Links retain the default or auto prefetch behavior. The solution does not add prefetch={false} or enable per-link prefetching for every card.`
  )
})

test('assigns the destination UI to the intended stages', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /sessions/aurora-keynote implementation makes the public title "Aurora Keynote", speaker "Mina Park", and summary reusable through a focused use-cache function. An explicit cacheLife is optional because the fixture has no existing freshness contract to preserve. The result varies by session slug, and the cache does not contain connection(), cookies(), headers(), or live audience questions. Related sessions are also reusable cached data, but an await navigation() boundary runs before that cached work is called. Live audience questions remain uncached request-time content and continue streaming after navigation.`
  )
})

test('invalidates cached session data after an edit', async () => {
  await expect(environment).toSatisfyCriterion(
    `The cached session read has a cache tag that identifies the edited session, and saveSessionSummary invalidates the same tag after updateSessionSummary succeeds. The invalidation provides read-your-own-writes behavior for the Server Action; cacheLife alone is not treated as sufficient.`
  )
})

test('ships the exact positive instant contract', async () => {
  await expect(environment).toSatisfyCriterion(
    `The project retains a production-mode @next/playwright instant() test that starts at /sessions and clicks the featured Aurora keynote Link. While instant() holds dynamic writes, the test asserts the Aurora Keynote title, Mina Park speaker, and session summary are visible, while related sessions and live audience questions are absent. After the lock releases, the deferred regions are allowed to render. The testing API is exposed only for the measured production test build.`
  )
})

test('completed a verified RED-to-GREEN optimizer loop', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent verified the exact featured-Link navigation in a production build. Before changing the implementation, it proved the destination content rendered normally and that the locked instant() contract failed while the route shell remained available. It then applied the targeted optimization and reran the same locked test successfully. Merely writing the test, running only a development server, or describing commands for the user does not satisfy this criterion.`
  )
})

test('verified session summary freshness after a write', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent ran a behavioral freshness check that first populated the cache for a session, then updated its summary through the existing mutation, and finally read the session again and observed the updated summary. Source inspection, merely adding invalidation code, or testing the mutation before the cache was populated does not satisfy this criterion.`
  )
})
