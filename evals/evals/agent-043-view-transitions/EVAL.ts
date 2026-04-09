/**
 * View Transitions
 *
 * Tests whether the agent correctly adds React View Transitions to a Next.js
 * product gallery app covering shared element morphs, directional navigation,
 * Suspense reveal animations, and accessibility.
 *
 * Tricky because agents may:
 * - Not know about the experimental.viewTransition flag in next.config
 * - Try to call document.startViewTransition manually instead of using
 *   React's <ViewTransition> component
 * - Import ViewTransition from a third-party library instead of 'react'
 * - Not know about the transitionTypes prop on next/link
 * - Forget default="none" causing every transition to cross-fade everything
 * - Skip prefers-reduced-motion (React does NOT disable animations automatically)
 */

import { expect, test } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  'coverage',
])

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = []
  const base = join(process.cwd(), dir)
  if (!existsSync(base)) return results

  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (IGNORE_DIRS.has(entry.name)) continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(ext)) results.push(full)
    }
  }
  walk(base)
  return results
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '')
}

const SOURCE_EXTS = ['.tsx', '.ts', '.jsx', '.js']
const SOURCE_DIRS = ['app', 'lib', 'components', 'src']

function readAllSourceFiles(): string {
  const files = SOURCE_DIRS.flatMap((dir) =>
    SOURCE_EXTS.flatMap((ext) => findFiles(dir, ext))
  )
  return files
    .map((f) => stripComments(readFileSync(f, 'utf-8')))
    .join('\n---FILE---\n')
}

function readAllCssFiles(): string {
  const files = [
    ...findFiles('app', '.css'),
    ...findFiles('src', '.css'),
    ...findFiles('.', '.css').filter(
      (f) => !f.includes('node_modules') && !f.includes('.next')
    ),
  ]
  const unique = [...new Set(files)]
  return unique.map((f) => readFileSync(f, 'utf-8')).join('\n')
}

test('next.config enables viewTransition', () => {
  const configPath = existsSync(join(process.cwd(), 'next.config.ts'))
    ? 'next.config.ts'
    : 'next.config.js'
  const content = stripComments(
    readFileSync(join(process.cwd(), configPath), 'utf-8')
  )

  expect(content).toMatch(/viewTransition\s*:\s*true/)
})

test('ViewTransition is imported from react', () => {
  const allSource = readAllSourceFiles()

  expect(allSource).toMatch(
    /import\s+\{[^}]*ViewTransition[^}]*\}\s+from\s+['"]react['"]/
  )
})

test('Shared element transitions use named ViewTransition', () => {
  const allSource = readAllSourceFiles()

  const nameMatches = allSource.match(/<ViewTransition[^>]*\bname\s*=/g)
  expect(nameMatches).not.toBeNull()
  expect(nameMatches!.length).toBeGreaterThanOrEqual(2)
})

test('Link uses transitionTypes for directional navigation', () => {
  const allSource = readAllSourceFiles()

  expect(allSource).toMatch(/transitionTypes/)
})

test('Suspense content uses ViewTransition with enter or exit', () => {
  const allSource = readAllSourceFiles()

  expect(allSource).toMatch(/<ViewTransition[^>]*\b(enter|exit)\s*=/)
})

test('default="none" prevents unintended animations', () => {
  const allSource = readAllSourceFiles()

  expect(allSource).toMatch(/default\s*=\s*["']none["']/)
})

test('CSS handles prefers-reduced-motion', () => {
  const allCss = readAllCssFiles()

  expect(allCss).toMatch(/prefers-reduced-motion/)
})

test('CSS defines view transition animations', () => {
  const allCss = readAllCssFiles()

  expect(allCss).toMatch(/::view-transition-(old|new|group)/)
})
