/**
 * Prefer Next.js Link
 *
 * Tests whether the agent uses the Next.js Link component for internal
 * navigation instead of plain <a> tags or programmatic router.push().
 *
 * Tricky because agents often use raw anchor tags or useRouter for simple
 * navigation where Link provides prefetching and client-side transitions.
 */

import { expect, test } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

test('Navigation component has required links', () => {
  const content = readFileSync(
    join(process.cwd(), 'app', 'Navigation.tsx'),
    'utf-8'
  )

  // Should have links to /blog, /products, and /support
  expect(content).toMatch(/['"]\/blog['"]/)
  expect(content).toMatch(/['"]\/products['"]/)
  expect(content).toMatch(/['"]\/support['"]/)
})

test('Navigation uses Next.js Link component', () => {
  const content = readFileSync(
    join(process.cwd(), 'app', 'Navigation.tsx'),
    'utf-8'
  )

  // Should import Link from next/link
  expect(content).toMatch(/import.*Link.*from ['"]next\/link['"]/)

  // Should use Link components, not anchor tags for navigation
  expect(content).toMatch(/<Link/)

  // Should not use anchor tags for internal navigation
  const anchorMatches = content.match(/<a [^>]*href=["']\/[^"']*["'][^>]*>/g)
  expect(anchorMatches).toBeNull()
})
