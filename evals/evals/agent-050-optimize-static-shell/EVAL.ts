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
})

test('produces a useful shell without caching request data', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /releases/aurora implementation keeps the release frame/navigation, Release operations heading, and cached launch checklist in the static shell. The checklist may render directly or remain inside a Suspense boundary; either is valid when the completed cached checklist is present in the shell. The existing viewer and rollout loading states are reused in focused Suspense boundaries. The viewer cookie and live rollout remain request-time and are not placed in a public cache. The page or a high-level boundary is not replaced with an empty or duplicate full-page fallback.`
  )
})

test('caches only the reusable launch checklist', async () => {
  await expect(environment).toSatisfyCriterion(
    `The file-backed launch checklist is made reusable with a targeted use-cache boundary, so the real checklist can be included in the static shell. The cache does not include cookies, viewer identity, connection(), or live rollout state. The URL-dependent rollout stays fresh and streams behind its existing LiveRolloutSkeleton.`
  )
})

test('ships trustworthy hard and soft instant guards', async () => {
  await expect(environment).toSatisfyCriterion(
    `The project retains separate production-mode @next/playwright instant() tests for an initial page.goto('/releases/aurora') and a Link click from / to /releases/aurora. While instant() holds request-time work, the tests assert the release shell, Release operations heading, and launch checklist are visible; the viewer and live rollout are absent; and their existing focused skeletons are visible. After the lock releases, the viewer and live rollout are allowed to render. exposeTestingApiInProductionBuild is enabled only for the measured test build. At least one guard proves deferred content is absent under the lock so a missing testing API cannot pass vacuously. The tests do not use arbitrary short timing races, hover warming, or next dev.`
  )
})

test('preserves the completed route behavior', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After the final production build, the agent verified the completed route rather than only the static shell: the viewer controls still use a supplied viewer cookie, the Aurora rollout still renders 72 percent and Global, the Nebula release still renders 18 percent and Europe, and an unknown release still renders the not-found UI. Source inspection or claims without executed verification do not satisfy this criterion.`
  )
})

test('completed a verified RED-to-GREEN optimization loop', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent used a production-like build, first confirmed the intended release-shell UI renders without instant(), then ran the locked instant() coverage against the unfixed route and observed a trustworthy RED. It fixed the route, removed the existing instant=false opt-out, built the final source successfully, and actually ran the initial-load and client-navigation guards against that build to GREEN. Merely writing tests or printing commands for the user does not satisfy this criterion.`
  )
})

test('proved the optimization caused the GREEN result', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After reaching GREEN, the agent performed the optimizer differential on the same production rig: it reverted only the static-shell implementation change and observed the locked contract return to RED, then reapplied the change and observed GREEN again. The regression test and test infrastructure remained in place for both sides of the comparison.`
  )
})
