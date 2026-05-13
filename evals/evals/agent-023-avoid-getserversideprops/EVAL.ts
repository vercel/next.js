/**
 * Avoid getServerSideProps
 *
 * Tests whether the agent uses an async server component for request-time
 * data fetching instead of the Pages Router getServerSideProps pattern.
 *
 * Tricky because agents trained on older docs reach for getServerSideProps
 * instead of fetching directly in an async App Router server component.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/** Strip JS/TS comments so we only test actual code, not migration notes */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

test('Page is an async server component with proper data fetching', () => {
  const pageContent = readFileSync(
    join(process.cwd(), 'app', 'page.tsx'),
    'utf-8'
  )

  // Should be an async function
  expect(pageContent).toMatch(/async\s+function|export\s+default\s+async/)

  // Should NOT have 'use client' directive
  expect(pageContent).not.toMatch(/['"]use client['"];?/)

  // Should fetch data server-side
  expect(pageContent).toMatch(/await.*fetch|fetch.*await/)
})

test('UserDashboard component uses App Router patterns', () => {
  const userDashboardContent = readFileSync(
    join(process.cwd(), 'app', 'UserDashboard.tsx'),
    'utf-8'
  )

  // Should be an async function (App Router pattern)
  expect(userDashboardContent).toMatch(
    /async\s+function|export\s+default\s+async/
  )

  // Should NOT use getServerSideProps in actual code (comments OK)
  expect(stripComments(userDashboardContent)).not.toMatch(/getServerSideProps/)

  // Should NOT have 'use client' directive
  expect(userDashboardContent).not.toMatch(/['"]use client['"];?/)
})

test('UserDashboard fetches dynamic user preferences', () => {
  const userDashboardContent = readFileSync(
    join(process.cwd(), 'app', 'UserDashboard.tsx'),
    'utf-8'
  )

  // Should fetch from user preferences API
  expect(userDashboardContent).toMatch(/api\.example\.com\/user\/preferences/)

  // Should use await fetch for server-side data fetching
  expect(userDashboardContent).toMatch(/await.*fetch|fetch.*await/)
})
