/**
 * Activity-aware Playwright locators
 *
 * Based on confirmed feedback that hidden Activity routes stay in the DOM,
 * getByLabel can match both copies, and choosing the first DOM match can select
 * hidden content. The agent must make the existing regression test visibility
 * aware without changing the application.
 */

import { expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const testSource = readFileSync(
  join(process.cwd(), 'tests/account.spec.ts'),
  'utf-8'
)
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('does not change the application to avoid the regression', () => {
  const appChanges = execFileSync(
    'git',
    ['status', '--short', '--', 'app', 'next.config.ts'],
    { encoding: 'utf8' }
  )
  expect(appChanges).toBe('')
})

test('does not pick an arbitrary DOM match', () => {
  expect(testSource).not.toMatch(/\.(?:first|last|nth)\s*\(/)
})

test('keeps the cross-route regression scenario', () => {
  expect(testSource).toMatch(/\/billing/)
  expect(testSource).toMatch(/Profile/)
  expect(testSource).toMatch(/Email/)
  expect(testSource).toMatch(/Profile ready/)
})

test('keeps a visibility-safe cross-route assertion', async () => {
  await expect(environment).toSatisfyCriterion(
    `The Playwright regression still visits Billing, enters a Billing value, client-navigates to Profile, interacts with the visible Email field, and asserts on the visible Profile status. Accept any locator strategy based on accessibility, visibility, or a visible route container. Reject first(), last(), nth(), a trivial replacement test, or a strategy that depends on DOM order.`
  )
})

test('passes the repaired browser regression', () => {
  execFileSync('npm', ['run', 'test:e2e'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 240_000,
  })
}, 300_000)
