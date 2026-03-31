/**
 * Use useActionState for client-side data fetching
 *
 * Tests whether the agent uses useActionState instead of the
 * useEffect + useState + loading anti-pattern.
 *
 * The correct pattern:
 *   - useActionState from React
 *   - <form action={...}> for the search form
 *   - isPending/pending for loading state
 *   - No useEffect, no useState for loading booleans
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Read SearchResults.tsx and any local files it imports from the app directory.
 * Agents sometimes extract logic into separate files, so we check imports too.
 */
function readSearchResultsAndImports(): string {
  const appDir = join(process.cwd(), 'app')

  const entries = readdirSync(appDir, { recursive: true }) as string[]
  const searchFile = entries.find(
    (f) =>
      /SearchResults/i.test(f) &&
      (f.endsWith('.tsx') || f.endsWith('.ts')) &&
      !f.includes('node_modules') &&
      !f.includes('api/')
  )

  if (!searchFile) return ''

  const searchContent = readFileSync(join(appDir, searchFile), 'utf-8')
  const parts = [searchContent]

  const importPattern = /from\s+['"]\.\/([^'"]+)['"]/g
  let match
  while ((match = importPattern.exec(searchContent)) !== null) {
    const importPath = match[1]
    for (const ext of [
      '.tsx',
      '.ts',
      '.js',
      '.jsx',
      '/index.tsx',
      '/index.ts',
    ]) {
      const fullPath = join(appDir, importPath + ext)
      if (existsSync(fullPath)) {
        parts.push(readFileSync(fullPath, 'utf-8'))
        break
      }
    }
  }

  for (const name of ['actions.ts', 'actions.tsx', 'action.ts', 'action.tsx']) {
    const actionsPath = join(appDir, name)
    if (existsSync(actionsPath)) {
      const content = readFileSync(actionsPath, 'utf-8')
      if (!parts.includes(content)) {
        parts.push(content)
      }
    }
  }

  return parts.join('\n')
}

test('does not use useEffect', () => {
  const content = readSearchResultsAndImports()
  expect(content).not.toMatch(/useEffect/)
})

test('does not use useState for manual loading state', () => {
  const content = readSearchResultsAndImports()
  expect(content).not.toMatch(
    /useState\s*(?:<\s*boolean\s*>)?\s*\(\s*(?:true|false)\s*\)/
  )
})

test('uses useActionState from React', () => {
  const content = readSearchResultsAndImports()
  expect(content).toMatch(/useActionState/)
})

test('uses form action pattern', () => {
  const content = readSearchResultsAndImports()
  expect(content).toMatch(/<form[^>]*action\s*=\s*\{/)
})

test('handles pending/loading state from useActionState', () => {
  const content = readSearchResultsAndImports()
  expect(content).toMatch(/pending|isPending/)
})
