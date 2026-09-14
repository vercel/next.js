/**
 * No Serial Await
 *
 * Tests whether the agent parallelizes independent data fetches with
 * Promise.all() instead of using sequential await calls.
 *
 * Tricky because agents default to sequential await for multiple fetches,
 * missing the opportunity to run independent requests concurrently.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('Page is an async server component with parallel data fetching', () => {
  const pageContent = readFileSync(
    join(process.cwd(), 'app', 'page.tsx'),
    'utf-8'
  )

  // Should be an async function
  expect(pageContent).toMatch(/async\s+function|export\s+default\s+async/)

  // Should NOT have 'use client' directive
  expect(pageContent).not.toMatch(/['"]use client['"];?/)

  // Should use parallel data fetching with Promise.all
  expect(pageContent).toMatch(/Promise\.all/)
})

test('Dashboard component fetches from all required APIs', () => {
  const dashboardContent = readFileSync(
    join(process.cwd(), 'app', 'Dashboard.tsx'),
    'utf-8'
  )

  // Should fetch from all three APIs
  expect(dashboardContent).toMatch(/\/api\/analytics/)
  expect(dashboardContent).toMatch(/\/api\/notifications/)
  expect(dashboardContent).toMatch(/\/api\/settings/)
})

test('Dashboard uses parallel fetching with Promise.all', () => {
  const dashboardContent = readFileSync(
    join(process.cwd(), 'app', 'Dashboard.tsx'),
    'utf-8'
  )

  // Should use Promise.all for parallel fetching
  expect(dashboardContent).toMatch(/Promise\.all/)

  // Should NOT use sequential awaits (this pattern indicates serial fetching)
  const sequentialAwaitPattern =
    /await\s+fetch.*\n.*await\s+fetch.*\n.*await\s+fetch/
  expect(dashboardContent).not.toMatch(sequentialAwaitPattern)
})

test('Dashboard is an async server component', () => {
  const dashboardContent = readFileSync(
    join(process.cwd(), 'app', 'Dashboard.tsx'),
    'utf-8'
  )

  // Should be async function
  expect(dashboardContent).toMatch(/async\s+function|export\s+default\s+async/)

  // Should NOT have 'use client' directive
  expect(dashboardContent).not.toMatch(/['"]use client['"];?/)
})

test('Dashboard displays data from all three sources', () => {
  const dashboardContent = readFileSync(
    join(process.cwd(), 'app', 'Dashboard.tsx'),
    'utf-8'
  )

  // Should display or reference analytics, notifications, and settings
  const displaysData =
    (dashboardContent.includes('analytics') ||
      dashboardContent.includes('Analytics')) &&
    (dashboardContent.includes('notifications') ||
      dashboardContent.includes('Notifications')) &&
    (dashboardContent.includes('settings') ||
      dashboardContent.includes('Settings'))

  expect(displaysData).toBe(true)
})
