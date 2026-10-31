/**
 * Activity-aware Playwright locators
 *
 * Based on confirmed feedback that hidden Activity routes stay in the DOM,
 * getByLabel can match both copies, and choosing the first DOM match can select
 * hidden content. The agent must make the existing regression test visibility
 * aware without changing the application.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { environment, transcript } from '@vercel/agent-eval/eval'

const testSource = readFileSync(
  join(process.cwd(), 'tests/account.spec.ts'),
  'utf-8'
)
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('does not pick an arbitrary DOM match', () => {
  expect(testSource).not.toMatch(/\.(?:first|last|nth)\s*\(/)
})

test('keeps the cross-route regression scenario', () => {
  expect(testSource).toMatch(/page\.goto\s*\(\s*['"]\/billing['"]\s*\)/)
  expect(testSource).toMatch(/getByRole\s*\(\s*['"]link['"][\s\S]*?Profile/)
  expect(testSource).toMatch(/\.click\s*\(/)
})

test('uses locators that exclude the hidden route', async () => {
  await expect(environment).toSatisfyCriterion(
    `Only the Playwright regression test and test configuration may change; the application and cacheComponents: true stay intact. After navigating from /billing to /profile, the test selects the visible Email field and visible status. Accept getByRole() locators whose default accessibility behavior excludes hidden Activity content, or getByLabel/getByTestId/locator calls filtered with { visible: true } before interaction or assertion. Reject first(), last(), nth(), selector changes that merely depend on DOM order, or application changes that remove or rename the duplicate controls.`
  )
})

test('runs the repaired browser regression', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent ran the existing npm run test:e2e command, or its exact build-plus-Playwright equivalent, after editing the test and observed it pass. Merely inspecting source, running a type check, or suggesting that the user run the test does not satisfy this criterion.`
  )
})
