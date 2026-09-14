/**
 * Forbidden Auth
 *
 * Tests whether the agent uses the forbidden() function from next/navigation
 * with authInterrupts enabled, plus a forbidden.tsx error boundary.
 *
 * Tricky because agents use redirect() or notFound() for authorization failures
 * instead of the dedicated forbidden() API that returns a proper 403 status.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

test('next.config enables authInterrupts', () => {
  const configPath = join(process.cwd(), 'next.config.ts')
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8')

    // The forbidden() function requires authInterrupts: true
    expect(content).toMatch(/authInterrupts\s*:\s*true/)
  }
})

test('Admin page imports forbidden from next/navigation', () => {
  const adminPagePath = join(process.cwd(), 'app', 'admin', 'page.tsx')
  if (existsSync(adminPagePath)) {
    const content = readFileSync(adminPagePath, 'utf-8')

    // Should import forbidden from next/navigation
    expect(content).toMatch(
      /import.*forbidden.*from\s+['"]next\/navigation['"]/
    )
  }
})

test('Admin page calls forbidden() for unauthorized access', () => {
  const adminPagePath = join(process.cwd(), 'app', 'admin', 'page.tsx')
  if (existsSync(adminPagePath)) {
    const content = readFileSync(adminPagePath, 'utf-8')

    // Should call forbidden() function
    expect(content).toMatch(/forbidden\s*\(\s*\)/)

    // Should check for admin role
    expect(content).toMatch(/admin|role/i)
  }
})

test('forbidden.tsx error boundary file exists', () => {
  // Check for forbidden.tsx at app level or admin level
  const appForbiddenPath = join(process.cwd(), 'app', 'forbidden.tsx')
  const adminForbiddenPath = join(
    process.cwd(),
    'app',
    'admin',
    'forbidden.tsx'
  )

  const hasForbiddenFile =
    existsSync(appForbiddenPath) || existsSync(adminForbiddenPath)

  // Should have a forbidden.tsx file for custom error UI
  expect(hasForbiddenFile).toBe(true)
})

test('forbidden.tsx has proper error UI', () => {
  const appForbiddenPath = join(process.cwd(), 'app', 'forbidden.tsx')
  const adminForbiddenPath = join(
    process.cwd(),
    'app',
    'admin',
    'forbidden.tsx'
  )

  const forbiddenPath = existsSync(appForbiddenPath)
    ? appForbiddenPath
    : adminForbiddenPath

  if (existsSync(forbiddenPath)) {
    const content = readFileSync(forbiddenPath, 'utf-8')

    // Should export a default function
    expect(content).toMatch(/export\s+default\s+function/)

    // Should show some error message
    expect(content).toMatch(/403|Forbidden|unauthorized|access/i)
  }
})

test('Does NOT use redirect for auth (should use forbidden)', () => {
  const adminPagePath = join(process.cwd(), 'app', 'admin', 'page.tsx')
  if (existsSync(adminPagePath)) {
    const content = readFileSync(adminPagePath, 'utf-8')

    // Should NOT use redirect for forbidden access
    // (redirect returns different HTTP status)
    const usesRedirect =
      content.includes("redirect('/login')") ||
      content.includes('redirect("/login")') ||
      content.includes("redirect('/unauthorized')") ||
      content.includes('redirect("/unauthorized")')

    // The proper pattern is to use forbidden(), not redirect
    // This test checks that redirect is not the primary auth mechanism
    // Some redirects might be acceptable, but forbidden() should be used
    expect(content).toMatch(/forbidden\s*\(\s*\)/)
    expect(usesRedirect).toBe(false)
  }
})
