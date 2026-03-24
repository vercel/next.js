/**
 * Catch Error
 *
 * Tests whether the agent uses `unstable_catchError` from `next/error` to create
 * a component-level error boundary instead of reaching for `error.js` or a raw
 * React error boundary class.
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
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
const allSource = sourceFiles.map((f) => f.content).join('\n')

test('uses unstable_catchError from next/error', () => {
  expect(allSource).toMatch(/from\s+['"]next\/error['"]/)
  expect(allSource).toMatch(/unstable_catchError/)
})

test("file with catchError has 'use client' directive", () => {
  const catchErrorFile = sourceFiles.find((f) =>
    f.content.includes('unstable_catchError')
  )
  expect(catchErrorFile).toBeDefined()
  expect(catchErrorFile!.content).toMatch(/['"]use client['"]/)
})

test('provides retry functionality via unstable_retry', () => {
  expect(allSource).toMatch(/unstable_retry/)
})

test('does not use error.js file convention', () => {
  const errorFile = sourceFiles.find((f) => /error\.(tsx?|jsx?)$/.test(f.path))
  expect(errorFile).toBeUndefined()
})

test('renders the error message', () => {
  const catchErrorFile = sourceFiles.find((f) =>
    f.content.includes('unstable_catchError')
  )
  expect(catchErrorFile).toBeDefined()
  expect(catchErrorFile!.content).toMatch(/error\.message/i)
})

test('does not use raw React error boundary class', () => {
  expect(allSource).not.toMatch(/componentDidCatch/)
  expect(allSource).not.toMatch(/getDerivedStateFromError/)
})
