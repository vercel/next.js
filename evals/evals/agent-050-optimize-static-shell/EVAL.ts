/**
 * Optimize a static shell
 *
 * This is intentionally not the team-settings example from the guide. The
 * agent must apply the same framework reasoning to a release route with a
 * request-specific layout control, reusable file-backed data, URL-dependent
 * live data, and both hard and soft navigation contracts.
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

test('removes the route opt-out while keeping Cache Components enabled', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
})

test('retains production instant navigation regression coverage', () => {
  expect(source).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(source).toMatch(/\binstant\s*\(/)
  expect(source).toMatch(/\.click\s*\(/)
  expect(source).toMatch(/\.goto\s*\(/)
})

test('keeps the reusable checklist cache explicit', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(source).toMatch(/\bcacheLife\s*\(/)
})

test('produces a useful shell without caching request data', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /releases/aurora implementation returns a meaningful static shell for both direct visits and client navigation. The release frame/navigation and Release operations heading are available without waiting for request-time work. The existing viewer and rollout loading states are reused in focused Suspense boundaries. The viewer cookie and live rollout remain request-time and are not placed in a public cache. The page or a high-level boundary is not replaced with an empty or duplicate full-page fallback.`
  )
})

test('caches only the reusable launch checklist', async () => {
  await expect(environment).toSatisfyCriterion(
    `The file-backed launch checklist is made reusable with a targeted use-cache boundary and an explicit cacheLife, so the real checklist can be included in the static shell. The cache does not include cookies, viewer identity, connection(), or live rollout state. The URL-dependent rollout stays fresh and streams behind its existing LiveRolloutSkeleton.`
  )
})

test('ships trustworthy hard and soft instant guards', async () => {
  await expect(environment).toSatisfyCriterion(
    `The project retains @next/playwright instant() regression tests for both a Link click from / to /releases/aurora and an initial page.goto('/releases/aurora'). Each test asserts a real visible marker from the meaningful release shell while the lock is active. The tests run against a production build with exposeTestingApiInProductionBuild enabled only for the test build. At least one guard is self-validating by proving live rollout content is absent under the lock, so a missing testing API cannot pass vacuously. The tests do not use arbitrary short timing races, hover warming, or next dev.`
  )
})

test('completed a verified RED-to-GREEN optimization loop', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent used a production-like build, first confirmed the chosen release-shell marker renders without instant(), then ran the locked instant() coverage against the unfixed route and observed a trustworthy RED. It fixed the route, removed the temporary instant=false opt-out, and actually reran the hard and soft guards to GREEN. It finished with a successful production build. Merely writing tests or printing commands for the user does not satisfy this criterion.`
  )
})
