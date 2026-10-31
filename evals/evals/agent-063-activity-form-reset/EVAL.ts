/**
 * Activity form reset
 *
 * Based on the reproduced development behavior where an Effect cleanup can
 * run again as Activity reveals a route. The agent must reset completed form
 * state from the user action that owns the transition while preserving drafts
 * on unrelated navigation.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const form = readFileSync(
  join(process.cwd(), 'app/contact/contact-form.tsx'),
  'utf-8'
)
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
})

test('resets from the Done navigation', () => {
  expect(form).toMatch(/<Link\b/)
  expect(form).toMatch(/href\s*=\s*['"]\/inbox['"]/)
  expect(form).toMatch(/onNavigate\s*=/)
})

test('does not use Effect cleanup as a navigation signal', () => {
  expect(form).not.toMatch(/\buse(?:Layout)?Effect\s*\(/)
})

test('preserves drafts and clears only the completed flow', async () => {
  await expect(environment).toSatisfyCriterion(
    `The contact form keeps an unfinished message when the user leaves through unrelated navigation. After a successful submission, the Done Link to /inbox owns the reset through onNavigate (or a handler that onNavigate invokes): it clears the success status and the submitted field before navigation. The solution does not reset from useEffect/useLayoutEffect setup or cleanup, does not attach the reset to every navigation link, and keeps cacheComponents: true. Accept either controlled-field state reset or form.reset() for the submitted field.`
  )
})
