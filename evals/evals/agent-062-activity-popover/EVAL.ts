/**
 * Activity popover state
 *
 * Based on confirmed feedback that Activity-preserved routes can retain
 * browser-managed overlays and duplicate fixed IDs across hidden and visible
 * pages. The agent must make the shared popover safe without disabling route
 * preservation or replacing the native interaction.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { environment } from '@vercel/agent-eval/eval'

const component = readFileSync(
  join(process.cwd(), 'app/options-popover.tsx'),
  'utf-8'
)
const config = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')

test('keeps Cache Components and the native popover enabled', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(component).toMatch(/popoverTarget/)
  expect(component).toMatch(/popover\s*=\s*['"]auto['"]/)
})

test('generates a unique popover id for every preserved instance', () => {
  expect(component).toMatch(/\buseId\s*\(/)
  expect(component).not.toMatch(
    /(?:id|popoverTarget)\s*=\s*['"]options-menu['"]/
  )
})

test('closes the browser-managed popover when Activity hides the route', () => {
  expect(component).toMatch(/\buseLayoutEffect\s*\(/)
  expect(component).toMatch(/return\s*\(\s*\)\s*=>[\s\S]*?\.hidePopover\s*\(/)
})

test('keeps the trigger and popover connected to the same unique id', async () => {
  await expect(environment).toSatisfyCriterion(
    `The shared OptionsPopover uses one React useId() value for both the trigger's popoverTarget and the popover element's id. A ref points at that popover element, and a useLayoutEffect cleanup calls hidePopover() on it when Activity hides the route. The solution keeps the native popover API and cacheComponents: true. Reject route-specific hard-coded IDs, React-only replacement menus, or disabling Cache Components.`
  )
})
