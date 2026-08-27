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

test('retains a production instant navigation regression test', () => {
  expect(source).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(source).toMatch(/\binstant\s*\(/)
  expect(source).toMatch(/\.click\s*\(/)
})

test('uses caching and a navigation stage', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(source).toMatch(/\bcacheLife\s*\(/)
  expect(source).toMatch(/\b(?:unstable_)?navigation\s*\(/)
})

test('optimizes only the selected featured navigation', async () => {
  await expect(environment).toSatisfyCriterion(
    `Only the featured Aurora keynote Link from /sessions opts into the stronger full prefetch using prefetch={true} or the equivalent bare prefetch prop. The other session-card Links retain the default or auto prefetch behavior. The solution does not add prefetch={false} and does not make every card use the stronger prefetch.`
  )
})

test('assigns the destination UI to the intended stages', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /sessions/aurora-keynote implementation makes the public title "Aurora Keynote", speaker "Mina Park", and summary available through a targeted use-cache function with an explicit cacheLife. That cache is keyed by the session slug and does not include connection(), cookies(), headers(), or live audience questions. Related sessions are reusable cached data but wait for the click through await navigation() before the cached work is read. Live audience questions remain uncached request-time content and continue streaming after navigation.`
  )
})

test('ships the exact positive instant contract', async () => {
  await expect(environment).toSatisfyCriterion(
    `The project retains a production-mode @next/playwright instant() test that starts at /sessions and clicks the featured Aurora keynote Link. While instant() holds dynamic writes, the test asserts the Aurora Keynote title, Mina Park speaker, and session summary are visible, while related sessions and live audience questions are absent. After the lock releases, the deferred regions are allowed to render. The testing API is exposed only for the measured production test build.`
  )
})

test('completed a verified RED-to-GREEN optimizer loop', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent used a production build and the exact /sessions featured-Link navigation. It first proved the selected destination markers eventually render without instant(), then ran the locked assertion before the optimization and observed a trustworthy RED with the route shell still available. It applied the targeted caching, Link policy, and navigation-stage changes, reran the same locked test to GREEN, and finished with a successful production verification. Merely writing tests or printing commands for the user does not satisfy this criterion.`
  )
})
