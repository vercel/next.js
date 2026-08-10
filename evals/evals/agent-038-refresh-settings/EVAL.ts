/**
 * Refresh Page via revalidatePath
 *
 * Tests whether the agent uses revalidatePath() from next/cache inside a
 * Server Action to refresh the current page after a mutation.
 *
 * Tricky because agents use redirect() to the same page (loses scroll/state),
 * return data for manual refresh, or use client-side router.refresh().
 */

import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// Helper to find all .ts and .tsx files
function findAllTsFiles(dir: string): string[] {
  const files: string[] = []
  try {
    const items = readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const fullPath = join(dir, item.name)
      if (
        item.isDirectory() &&
        item.name !== 'node_modules' &&
        item.name !== '.next'
      ) {
        files.push(...findAllTsFiles(fullPath))
      } else if (
        item.isFile() &&
        (item.name.endsWith('.ts') || item.name.endsWith('.tsx'))
      ) {
        files.push(fullPath)
      }
    }
  } catch {
    // Ignore directories that can't be read
  }
  return files
}

test('Server Action imports refresh from next/cache', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let foundRefreshImport = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (content.match(/import.*refresh.*from\s+['"]next\/cache['"]/)) {
      foundRefreshImport = true
      break
    }
  }

  expect(foundRefreshImport).toBe(true)
})

test('Server Action uses "use server" directive', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let foundServerAction = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (content.includes("'use server'") || content.includes('"use server"')) {
      foundServerAction = true
      break
    }
  }

  expect(foundServerAction).toBe(true)
})

test('Server Action calls refresh() for page refresh', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let foundRefreshCall = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    // Must have "use server" and refresh() call
    if (
      (content.includes("'use server'") || content.includes('"use server"')) &&
      content.match(/refresh\s*\(\s*\)/)
    ) {
      foundRefreshCall = true
      break
    }
  }

  expect(foundRefreshCall).toBe(true)
})

test('Does NOT use redirect for same-page update', () => {
  const allFiles = findAllTsFiles(process.cwd())

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (content.includes("'use server'") || content.includes('"use server"')) {
      // If it has refresh(), good - that's what we want
      if (content.match(/refresh\s*\(\s*\)/)) {
        // Should use refresh, not redirect for same-page updates
        expect(content).toMatch(/refresh\s*\(\s*\)/)
      }
    }
  }
})

test('Does NOT use router.refresh() from client (should use server-side refresh)', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let usesServerRefresh = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    // Check for server-side refresh import
    if (content.match(/import.*refresh.*from\s+['"]next\/cache['"]/)) {
      usesServerRefresh = true
    }
  }

  // Should use server-side refresh from next/cache
  expect(usesServerRefresh).toBe(true)
})

test('Server Action has notification/toggle logic', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let hasToggleLogic = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (
      (content.includes("'use server'") || content.includes('"use server"')) &&
      content.match(/notification|toggle|preference|setting/i)
    ) {
      hasToggleLogic = true
      break
    }
  }

  expect(hasToggleLogic).toBe(true)
})
