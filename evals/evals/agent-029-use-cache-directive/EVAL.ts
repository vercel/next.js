/**
 * Use Cache Directive
 *
 * Generic behavior checks for this scenario:
 * - product reads use cache + cacheTag("products")
 * - getAllProducts() from lib/db is used
 * - an inline Server Action flow exists and is form-triggered
 * - revalidateTag("products", profile) is used
 * - updateTag is not used
 */

import { expect, test } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

type SourceFile = { path: string; content: string }

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
])

const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function readSourceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return []

  const files: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
      continue
    }

    if (IGNORE_FILES.has(entry)) continue

    if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push({
        path: fullPath,
        content: readFileSync(fullPath, 'utf-8'),
      })
    }
  }

  return files
}

const sourceFiles = readSourceFiles(process.cwd())
const source = sourceFiles.map((file) => file.content).join('\n')

function fileWith(pattern: RegExp): SourceFile | undefined {
  return sourceFiles.find((file) => pattern.test(file.content))
}

test('Catalog reads use use-cache directive and products cache tag', () => {
  // Allow caching logic to live in app or lib helper modules.
  expect(source).toMatch(/['"]use cache['"];?/)

  // Tagged invalidation should target the required products key.
  expect(source).toMatch(/cacheTag\s*\(\s*['"]products['"]\s*\)/)
})

test('Page fetches products via lib/db', () => {
  // Keep data source expectation explicit without location assumptions.
  expect(source).toMatch(/import.*getAllProducts.*lib\/db|from.*lib\/db/)
  expect(source).toMatch(/await\s+getAllProducts\s*\(|getAllProducts\s*\(/)
})

test('Inline form-triggered Server Action flow exists', () => {
  const inlineActionFile = sourceFiles.find((file) => {
    return (
      /<form[\s\S]*action\s*=\s*\{/.test(file.content) &&
      /['"]use server['"];?/.test(file.content) &&
      (/async\s+function\s+\w+/.test(file.content) ||
        /const\s+\w+\s*=\s*async\s*\(/.test(file.content))
    )
  })

  expect(
    inlineActionFile,
    'Expected one file to contain form action={...} and inline Server Action markers'
  ).toBeDefined()
})

test('Server Action revalidates products using revalidateTag profile', () => {
  const revalidateFile = fileWith(/revalidateTag\s*\(/)
  expect(revalidateFile, 'Expected source to call revalidateTag').toBeDefined()

  // The chosen API should be revalidateTag in this workflow.
  expect(revalidateFile?.content ?? '').toMatch(
    /import.*revalidateTag.*from\s+['"]next\/cache['"]/
  )
  expect(revalidateFile?.content ?? '').toMatch(/revalidateTag\s*\(/)

  // Require the same explicit products tag and a profile/second argument.
  expect(revalidateFile?.content ?? '').toMatch(
    /revalidateTag\s*\(\s*['"]products['"]\s*,/
  )

  // Avoid read-your-own-writes invalidation API in this scenario.
  expect(source).not.toMatch(/\bupdateTag\s*\(/)
})
