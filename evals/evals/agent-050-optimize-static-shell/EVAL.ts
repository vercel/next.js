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
const testSource = readSourceFiles(join(process.cwd(), 'tests')).join('\n')
const releaseDataSource = readFileSync(
  join(process.cwd(), 'lib/releases.ts'),
  'utf-8'
)

test('removes the route opt-out while keeping Cache Components enabled', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(source).not.toMatch(/export\s+(?:const|var|let)\s+instant\s*=\s*false/)
})

test('covers direct visits and client navigations with instant()', () => {
  expect(testSource).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(testSource).toMatch(/\binstant\s*\(/)
  expect(testSource).toMatch(/\.click\s*\(/)
  expect(testSource).toMatch(/\.goto\s*\(/)
})

test('asserts the complete instant shell contract', () => {
  expect(testSource).toMatch(/release-shell/)
  expect(testSource).toMatch(/release-heading/)
  expect(testSource).toMatch(/launch-checklist/)
  expect(testSource).toMatch(/viewer-skeleton/)
  expect(testSource).toMatch(/rollout-skeleton/)
  expect(testSource).toMatch(/viewer-controls/)
  expect(testSource).toMatch(/live-rollout/)
})

test('caches the reusable checklist without replacing its data source', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(releaseDataSource).toMatch(/\breadFile\b/)
  expect(releaseDataSource).not.toMatch(/import\s+launchChecklist\s+from/)
})

test('puts the intended reusable UI in the static shell', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /releases/aurora implementation keeps the release frame/navigation, Release operations heading, and launch checklist in the static shell. Only the existing launch-checklist read is cached, and the implementation preserves that read rather than replacing it with a build-time import. The page or a high-level boundary is not replaced with an empty or duplicate full-page fallback.`
  )
})

test('keeps request-time UI behind focused loading states', async () => {
  await expect(environment).toSatisfyCriterion(
    `The viewer cookie and live rollout remain request-time and are not placed in a public cache. The existing viewer and rollout loading states are reused in focused Suspense boundaries. Under the instant() lock, both skeletons are visible while viewer controls and live rollout are absent. After release, the request-time UI renders and replaces those loading states.`
  )
})

test('preserves all completed release variants', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Using the existing production rig, the agent executed completed-route parity checks rather than only inspecting source or the static shell. The Aurora rollout still renders 72 percent and Global, the Nebula release still renders 18 percent and Europe, and an unknown release still renders the not-found UI.`
  )
})

test('preserves the request-specific viewer cookie', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Using the existing production rig, the agent verified that viewer controls render the viewer supplied through the rig's optional viewer cookie after the instant() lock releases. Merely retaining cookie-reading source code does not satisfy this criterion.`
  )
})

test('proved the unlocked baseline and trustworthy RED', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent reused instant-nav.rig.md and its production Playwright command instead of creating another server lifecycle. Before changing production code, it confirmed the complete intended UI rendered once without instant(), then observed a locked RED on the unfixed route for the intended missing shell behavior. A timeout before navigation, missing fixture data, stale build, or unavailable selector does not satisfy this criterion.`
  )
})

test('reached GREEN and ran the complete production suite', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After applying the optimization, the agent ran the required direct-visit and client-navigation instant() contracts successfully on the production rig. It also ran the complete in-scope production command with no required test skipped, and verified completed content after the lock released. Merely writing the tests, passing a filtered subset, or obtaining a successful build does not satisfy this criterion.`
  )
})

test('completed the bounded differential', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After reaching GREEN, the agent reverted only the implementation fix and observed every intended instant() contract return to RED. It then reapplied the fix and observed final GREEN. It ran one conclusive check per gate and repeated a build or test only after changing code or observing an infrastructure failure, not as an arbitrary stress or flake loop. Merely describing the differential or changing the tests during it does not satisfy this criterion.`
  )
})
