/**
 * updateTag() for Read-Your-Own-Writes
 *
 * Tests whether the agent uses updateTag() from next/cache in a Server Action
 * for immediate cache invalidation (read-your-own-writes semantics).
 *
 * Tricky because agents use revalidateTag() which has stale-while-revalidate
 * semantics — updateTag() waits for fresh data and only works in Server Actions.
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

test('Server Action imports updateTag from next/cache', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let foundUpdateTagImport = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (content.match(/import.*updateTag.*from\s+['"]next\/cache['"]/)) {
      foundUpdateTagImport = true
      break
    }
  }

  expect(foundUpdateTagImport).toBe(true)
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

test('Server Action calls updateTag() for cache invalidation', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let foundUpdateTagCall = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    // Must have "use server" and updateTag call
    if (
      (content.includes("'use server'") || content.includes('"use server"')) &&
      content.match(/updateTag\s*\(/)
    ) {
      foundUpdateTagCall = true
      break
    }
  }

  expect(foundUpdateTagCall).toBe(true)
})

test('Does NOT use revalidateTag for read-your-own-writes (should use updateTag)', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let usesUpdateTag = false
  let usesOnlyRevalidateTag = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (content.includes("'use server'") || content.includes('"use server"')) {
      if (content.match(/updateTag\s*\(/)) {
        usesUpdateTag = true
      }
      if (
        content.match(/revalidateTag\s*\(/) &&
        !content.match(/updateTag\s*\(/)
      ) {
        usesOnlyRevalidateTag = true
      }
    }
  }

  // Should use updateTag, not just revalidateTag
  expect(usesUpdateTag).toBe(true)
  expect(usesOnlyRevalidateTag).toBe(false)
})

test('Server Action has post creation logic', () => {
  const allFiles = findAllTsFiles(process.cwd())

  let hasPostLogic = false

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf-8')
    if (
      (content.includes("'use server'") || content.includes('"use server"')) &&
      content.match(/post|create|formData|title|content/i)
    ) {
      hasPostLogic = true
      break
    }
  }

  expect(hasPostLogic).toBe(true)
})
