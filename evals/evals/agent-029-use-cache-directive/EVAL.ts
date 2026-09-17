/**
 * Use Cache Directive
 *
 * Generic behavior checks for this scenario:
 * - product reads use `use cache` and are tagged with the products key
 * - the catalog is sourced from getAllProducts() in lib/db
 * - an inline Server Action flow exists and is form-triggered
 * - the action revalidates that tag with a profile argument
 * - updateTag is not used
 *
 * The updateTag point is deliberate but is judged, not grepped: a source-text
 * ban fails a correct solution that merely names the API in a comment
 * explaining why it was rejected, which is exactly the reasoning we want. The prompt asks for the
 * admin to keep working while the list is briefly stale and refreshes in the
 * background, which is revalidateTag's stale-while-revalidate semantics.
 * updateTag is the read-your-own-writes API and answers a different question;
 * agent-037-updatetag-cache covers that one.
 *
 * The tag and data-source checks are judged rather than matched literally.
 * They used to require the exact strings cacheTag('products') and
 * revalidateTag('products', ...), so hoisting the key into a named constant
 * failed, and they looked for the substring "lib/db" in an import, so a caching
 * wrapper placed inside lib/ importing './db.js' relatively failed. Both are
 * correct, and arguably better, implementations of the same requirement.
 */

import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'
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

test('Catalog is cached, tagged, and revalidated by the sync action', async () => {
  // Cheap and style-independent: the directive itself must be present somewhere.
  expect(source).toMatch(/['"]use cache['"];?/)

  // One judge call rather than two: the whole EVAL.ts run must finish inside
  // 60s or vitest's worker RPC times out and fails the run even when every
  // assertion passed. Two passes measured 76s; one measures well under.
  await expect(environment).toSatisfyCriterion(
    `Product catalog reads are cached and tagged, so that one tagged revalidation refreshes every view built on that data, and the "Sync latest catalog" Server Action invalidates them by revalidating that same tag with a revalidation profile. The catalog itself comes from the getAllProducts() helper the project already ships in lib/db rather than a reimplemented query.

Correct:

  // lib/products.ts
  export const PRODUCTS_TAG = 'products'

  export async function getProducts() {
    'use cache'
    cacheTag(PRODUCTS_TAG)
    return getAllProducts()
  }

  // the Server Action
  async function syncCatalog() {
    'use server'
    await refreshFromErp()
    revalidateTag(PRODUCTS_TAG, 'max')
  }

Incorrect:

  export async function getProducts() {
    return getAllProducts()          // nothing cached, nothing to revalidate
  }

  export async function getProducts() {
    'use cache'                      // cached but untagged, so the action has
    return getAllProducts()          // no way to invalidate it
  }

  revalidateTag(PRODUCTS_TAG)        // no profile argument
  revalidateTag('catalog', 'max')    // not the tag the catalog read carries
  updateTag(PRODUCTS_TAG)            // read-your-own-writes; wrong API for this
                                     // scenario, which wants the admin to carry
                                     // on while the catalog refreshes behind them

Judge the code that runs. Naming updateTag in a comment to explain why it was not chosen is correct reasoning, not a violation.

Judge whether the caching, tagging and invalidation are wired to each other, not how they are spelled or which files they live in.

These APIs are newer than most training data. Docs for the exact Next.js version installed here ship at node_modules/next/dist/docs — see 01-app/03-api-reference/01-directives/use-cache.md, 01-app/03-api-reference/04-functions/cacheTag.md and 01-app/03-api-reference/04-functions/revalidateTag.md.`
  )
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
