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

test('retains production instant navigation regression coverage', () => {
  expect(testSource).toMatch(/from\s+['"]@next\/playwright['"]/)
  expect(testSource).toMatch(/\binstant\s*\(/)
  expect(testSource).toMatch(/\.click\s*\(/)
  expect(testSource).toMatch(/\.goto\s*\(/)
  expect(testSource).toMatch(/release-shell/)
  expect(testSource).toMatch(/release-heading/)
  expect(testSource).toMatch(/launch-checklist/)
  expect(testSource).toMatch(/viewer-controls/)
  expect(testSource).toMatch(/live-rollout/)
  expect(testSource).toMatch(/viewer-skeleton/)
  expect(testSource).toMatch(/rollout-skeleton/)
})

test('caches the reusable checklist without replacing its data source', () => {
  expect(source).toMatch(/['"]use cache['"]/)
  expect(releaseDataSource).toMatch(/\breadFile\b/)
  expect(releaseDataSource).not.toMatch(/import\s+launchChecklist\s+from/)
})

test('produces the intended shell and request-time split', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final /releases/aurora implementation keeps the release frame/navigation, Release operations heading, and launch checklist in the static shell. The existing viewer and rollout loading states are reused in focused Suspense boundaries. Only the existing launch-checklist read is cached; the implementation preserves that read instead of replacing it with a build-time import. The viewer cookie and live rollout remain request-time and are not placed in a public cache. The page or a high-level boundary is not replaced with an empty or duplicate full-page fallback. Separate production @next/playwright instant() tests cover a direct visit and a real Link click. Under the lock they assert the complete shell, both focused skeletons, and the absence of viewer controls and live rollout. After release, the request-time UI renders.`
  )
})

test('preserves the completed route behavior', async () => {
  await expect(transcript).toSatisfyCriterion(
    `Using the existing production rig, the agent executed completed-route parity checks rather than only inspecting source or the static shell. The viewer controls still use a supplied viewer cookie, the Aurora rollout still renders 72 percent and Global, the Nebula release still renders 18 percent and Europe, and an unknown release still renders the not-found UI.`
  )
})

test('completed a bounded RED-to-GREEN differential', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent reused instant-nav.rig.md and its production Playwright command instead of creating another server lifecycle. It confirmed the intended UI once without instant(), observed a trustworthy locked RED on the unfixed route, reached GREEN after the fix, reverted only the implementation to observe RED again, and reapplied it to observe final GREEN. It ran one conclusive check per gate and repeated a build or test only after changing code or observing an infrastructure failure, not as an arbitrary stress or flake loop. Merely writing tests or commands does not satisfy this criterion.`
  )
})
