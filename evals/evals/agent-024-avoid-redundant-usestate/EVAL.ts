/**
 * Avoid Redundant useState
 *
 * Tests whether the agent computes derived values directly from props/data
 * instead of storing them in redundant useState + useEffect.
 *
 * Tricky because agents overuse useState for values that can be computed
 * inline, adding unnecessary state and useEffect synchronization.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('Page renders User Management heading', () => {
  const content = readFileSync(join(process.cwd(), 'app', 'page.tsx'), 'utf-8')
  expect(content).toMatch(/User\s+Management/)
})

test('UserStats component avoids redundant useState', () => {
  const userStatsContent = readFileSync(
    join(process.cwd(), 'app', 'UserStats.tsx'),
    'utf-8'
  )

  // Should NOT use useState for calculated values
  expect(userStatsContent).not.toMatch(/useState.*active|active.*useState/)
  expect(userStatsContent).not.toMatch(/useState.*count|count.*useState/)
  expect(userStatsContent).not.toMatch(
    /useState.*percentage|percentage.*useState/
  )

  // Should NOT use useEffect to update derived state
  expect(userStatsContent).not.toMatch(/useEffect/)
})

test('UserStats component computes derived values directly', () => {
  const userStatsContent = readFileSync(
    join(process.cwd(), 'app', 'UserStats.tsx'),
    'utf-8'
  )

  // Should compute values directly from props
  const hasDirectComputation =
    userStatsContent.includes('.filter(') ||
    userStatsContent.includes('.length') ||
    userStatsContent.includes('users.') ||
    userStatsContent.includes('isActive')

  expect(hasDirectComputation).toBe(true)

  // Should calculate percentage
  const hasPercentageCalc =
    userStatsContent.includes('percentage') ||
    userStatsContent.includes('%') ||
    userStatsContent.includes('* 100') ||
    userStatsContent.includes('Math.')

  expect(hasPercentageCalc).toBe(true)
})

test('UserStats displays all required statistics', () => {
  const userStatsContent = readFileSync(
    join(process.cwd(), 'app', 'UserStats.tsx'),
    'utf-8'
  )

  // Should display active count, inactive count, and percentage
  const displaysStats =
    userStatsContent.includes('active') &&
    userStatsContent.includes('inactive') &&
    (userStatsContent.includes('percentage') || userStatsContent.includes('%'))

  expect(displaysStats).toBe(true)
})
