/**
 * Avoid Fetch in useEffect
 *
 * Tests whether the agent uses server-side data fetching in a server component
 * instead of the client-side useEffect + fetch + useState pattern.
 *
 * Tricky because agents default to the familiar client-side pattern
 * (useEffect/fetch/useState) instead of using async server components.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('Page is an async server component', () => {
  const pageContent = readFileSync(
    join(process.cwd(), 'app', 'page.tsx'),
    'utf-8'
  )

  // Should be an async function
  expect(pageContent).toMatch(/async\s+function|export\s+default\s+async/)

  // Should NOT have 'use client' directive
  expect(pageContent).not.toMatch(/['"]use client['"];?/)
})

test('UserProfile component is a server component', () => {
  const userProfileContent = readFileSync(
    join(process.cwd(), 'app', 'UserProfile.tsx'),
    'utf-8'
  )

  // Should NOT have 'use client' directive
  expect(userProfileContent).not.toMatch(/['"]use client['"];?/)

  // Should NOT use useEffect
  expect(userProfileContent).not.toMatch(/useEffect/)

  // Should NOT use useState
  expect(userProfileContent).not.toMatch(/useState/)
})

test('UserProfile component uses async/await pattern', () => {
  const userProfileContent = readFileSync(
    join(process.cwd(), 'app', 'UserProfile.tsx'),
    'utf-8'
  )

  // Should be an async function for server component
  expect(userProfileContent).toMatch(
    /async\s+function|export\s+default\s+async/
  )

  // Should use await for fetching
  expect(userProfileContent).toMatch(/await/)
})

test('UserProfile component fetches from correct endpoint', () => {
  const userProfileContent = readFileSync(
    join(process.cwd(), 'app', 'UserProfile.tsx'),
    'utf-8'
  )

  // Should fetch from /api/users/profile
  expect(userProfileContent).toMatch(/\/api\/users\/profile/)

  // Should use fetch
  expect(userProfileContent).toMatch(/fetch\s*\(/)
})

test('UserProfile component displays user data', () => {
  const userProfileContent = readFileSync(
    join(process.cwd(), 'app', 'UserProfile.tsx'),
    'utf-8'
  )

  // Should display name and email
  const displaysUserData =
    userProfileContent.includes('name') && userProfileContent.includes('email')

  expect(displaysUserData).toBe(true)
})
