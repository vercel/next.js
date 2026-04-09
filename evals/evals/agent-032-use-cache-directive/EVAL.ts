/**
 * Use Cache with Cache Components
 *
 * Tests whether the agent uses the 'use cache' directive with cacheComponents
 * enabled in next.config, plus proper cacheLife() and cacheTag() usage.
 *
 * Tricky because agents use deprecated patterns like fetch({ next: { revalidate } }),
 * route segment config, or unstable_cache instead of 'use cache' + cacheComponents.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

test('next.config enables cacheComponents', () => {
  const configPath = join(process.cwd(), 'next.config.ts')
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8')

    // In Next.js 16+, cacheComponents must be enabled for 'use cache' directive
    expect(content).toMatch(/cacheComponents\s*:\s*true/)
  }
})

test('Page or component uses "use cache" directive', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  if (existsSync(pagePath)) {
    const content = readFileSync(pagePath, 'utf-8')

    // Should use the 'use cache' directive (Next.js 16+ pattern)
    expect(content).toMatch(/['"]use cache['"]/)
  }
})

test('Component uses cacheLife function for cache duration', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  if (existsSync(pagePath)) {
    const content = readFileSync(pagePath, 'utf-8')

    // Should import cacheLife from next/cache
    expect(content).toMatch(/import.*cacheLife.*from\s+['"]next\/cache['"]/)

    // Should use cacheLife function (e.g., cacheLife('hours') or custom config)
    expect(content).toMatch(/cacheLife\s*\(/)
  }
})

test('Component uses cacheTag function for on-demand invalidation', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  if (existsSync(pagePath)) {
    const content = readFileSync(pagePath, 'utf-8')

    // Should import cacheTag from next/cache
    expect(content).toMatch(/import.*cacheTag.*from\s+['"]next\/cache['"]/)

    // Should use cacheTag function with "posts" tag
    expect(content).toMatch(/cacheTag\s*\(\s*['"]posts['"]\s*\)/)
  }
})

test('Page fetches posts using getPosts', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  if (existsSync(pagePath)) {
    const content = readFileSync(pagePath, 'utf-8')

    // Should import getPosts from lib/api
    expect(content).toMatch(/import.*getPosts.*from\s+['"].*lib\/api['"]/)

    // Should call getPosts
    expect(content).toMatch(/getPosts\s*\(/)

    // Should be an async function/component
    expect(content).toMatch(/async/)
  }
})

test('Does NOT use deprecated caching patterns', () => {
  const pagePath = join(process.cwd(), 'app', 'page.tsx')
  if (existsSync(pagePath)) {
    const content = readFileSync(pagePath, 'utf-8')

    // Should NOT use old fetch caching options
    expect(content).not.toMatch(/next\s*:\s*\{\s*revalidate/)

    // Should NOT use unstable_cache
    expect(content).not.toMatch(/unstable_cache/)
  }

  const configPath = join(process.cwd(), 'next.config.ts')
  if (existsSync(configPath)) {
    const configContent = readFileSync(configPath, 'utf-8')

    // Should NOT use experimental.dynamicIO (renamed to cacheComponents)
    expect(configContent).not.toMatch(/dynamicIO/)
  }
})
