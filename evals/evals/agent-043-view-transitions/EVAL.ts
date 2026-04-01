/**
 * Use React <ViewTransition> for page navigation animations
 *
 * Tests whether the agent uses React's <ViewTransition> component and
 * enables the Next.js experimental.viewTransition flag, rather than
 * manually calling document.startViewTransition.
 *
 * The correct pattern:
 *   - import { ViewTransition } from 'react'
 *   - Wrap page content with <ViewTransition>
 *   - Enable experimental.viewTransition in next.config.ts
 *   - No manual document.startViewTransition calls
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/** Read all .tsx/.ts/.js/.jsx files under app/ recursively. */
function readAppFiles(): string {
  const appDir = join(process.cwd(), 'app')
  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const parts: string[] = []

  for (const entry of entries) {
    if (
      /\.(tsx?|jsx?)$/.test(entry) &&
      !entry.includes('node_modules')
    ) {
      parts.push(readFileSync(join(appDir, entry), 'utf-8'))
    }
  }

  return parts.join('\n')
}

test('imports ViewTransition from react', () => {
  const content = readAppFiles()
  expect(content).toMatch(/ViewTransition/)
  expect(content).toMatch(/from\s+['"]react['"]/)
})

test('uses <ViewTransition> in JSX', () => {
  const content = readAppFiles()
  expect(content).toMatch(/<ViewTransition[\s>]/)
})

test('enables viewTransition in next.config', () => {
  const configPath = join(process.cwd(), 'next.config.ts')
  const content = readFileSync(configPath, 'utf-8')
  expect(content).toMatch(/viewTransition\s*:\s*true/)
})

test('does not use document.startViewTransition', () => {
  const content = readAppFiles()
  expect(content).not.toMatch(/document\.startViewTransition/)
})
