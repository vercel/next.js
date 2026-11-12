/**
 * Prefetch URL data
 *
 * Verifies the basic Partial Prefetching inclusion case: the agent caches data
 * that depends on searchParams and makes it available in a per-link prefetch.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { chromium, expect as browserExpect } from '@playwright/test'
import { instant } from '@next/playwright'
import {
  buildNextApp,
  startNextServer,
} from './__agent_eval__/next-test-utils.mjs'

const IGNORE_DIRS = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '__agent_eval__',
  '__eval__',
])

const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function readSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
    } else if (!IGNORE_FILES.has(entry) && /\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(stripComments(readFileSync(fullPath, 'utf-8')))
    }
  }

  return files
}

const source = readSourceFiles(process.cwd()).join('\n---FILE---\n')
const config = stripComments(
  readFileSync(join(process.cwd(), 'next.config.ts'), 'utf-8')
)

test('enables Partial Prefetching globally or for the catalog route', () => {
  expect(config).toMatch(/cacheComponents\s*:\s*true/)
  expect(
    /partialPrefetching\s*:\s*true/.test(config) ||
      /export\s+const\s+prefetch\s*=\s*['"]partial['"]/.test(source)
  ).toBe(true)
})

test('preserves the category URL structure', () => {
  expect(source).toMatch(/\/catalog\?category=/)
  expect(source).toMatch(/\bsearchParams\b/)
})

test('opts the category links into per-link prefetching', () => {
  expect(source).toMatch(/<Link\b[^>]*\bprefetch(?:\s*=\s*\{true\})?(?:\s|>)/)
})

test('caches the category data', () => {
  expect(source).toMatch(/['"]use cache['"]/)
})

test('does not use a navigation-stage boundary', () => {
  expect(source).not.toMatch(
    /import\s*\{[^}]*\bnavigation\b[^}]*\}\s*from\s*['"]next\/cache['"]/
  )
})

test('prefetches each category heading and products before navigation', async () => {
  await buildNextApp()
  const app = await startNextServer()
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    const categories = [
      {
        slug: 'featured',
        heading: 'Featured products',
        products: ['Desk Lamp', 'Wool Blanket'],
      },
      {
        slug: 'sale',
        heading: 'Products on sale',
        products: ['Canvas Tote', 'Travel Mug'],
      },
    ]
    for (const category of categories) {
      // Each category starts without a prior navigation warming its router cache.
      const context = await browser.newContext()
      try {
        const page = await context.newPage()
        await page.goto(app.url)
        await instant(page, async () => {
          await page
            .getByRole('link', { name: category.heading, exact: true })
            .click()
          await page.waitForURL(`${app.url}/catalog?category=${category.slug}`)
          await browserExpect(
            page.getByRole('heading', { name: category.heading, exact: true })
          ).toBeVisible()
          for (const product of category.products) {
            await browserExpect(
              page.getByRole('listitem').filter({ hasText: product })
            ).toBeVisible()
          }
          for (const other of categories.filter(
            (item) => item.slug !== category.slug
          )) {
            for (const product of other.products) {
              await browserExpect(
                page.getByRole('listitem').filter({ hasText: product })
              ).not.toBeVisible()
            }
          }
          await browserExpect(
            page.getByText('Loading category...', { exact: true })
          ).not.toBeVisible()
        })
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser?.close()
    await app.stop()
  }
}, 240_000)
