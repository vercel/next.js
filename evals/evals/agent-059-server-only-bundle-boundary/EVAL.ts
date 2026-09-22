/**
 * Keep a database schema out of the client bundle
 *
 * The client imports a reusable attachment validator through a database-owned
 * module. A complete fix uses the shared owner directly and guards the database
 * boundary so the same mistake becomes a build error.
 */

import { expect, test } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { environment, transcript } from '@vercel/agent-eval/eval'

const IGNORE_DIRS = new Set(['.git', '.next', 'node_modules'])
const IGNORE_FILES = new Set(['EVAL.ts', 'PROMPT.md'])

type SourceFile = {
  path: string
  source: string
}

function readSourceFiles(dir: string): SourceFile[] {
  if (!existsSync(dir)) return []

  const files: SourceFile[] = []
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue

    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...readSourceFiles(fullPath))
    } else if (!IGNORE_FILES.has(entry) && /\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push({
        path: relative(process.cwd(), fullPath),
        source: readFileSync(fullPath, 'utf-8'),
      })
    }
  }

  return files
}

const files = readSourceFiles(process.cwd())

test('client modules no longer import the database schema', () => {
  const clientFiles = files.filter(({ source }) =>
    /^\s*['"]use client['"]/m.test(source)
  )

  expect(clientFiles.length).toBeGreaterThan(0)
  for (const file of clientFiles) {
    expect(file.source, file.path).not.toMatch(/chat-db(?:\/|['"])/)
  }
})

test('guards the database-owned module from client imports', () => {
  const databaseFiles = files.filter(({ source }) =>
    source.includes('DB_ONLY_SCHEMA_MARKER')
  )

  expect(databaseFiles.length).toBeGreaterThan(0)
  expect(
    databaseFiles.some(({ source }) =>
      /(?:import|require\()\s*['"]server-only['"]\)?/.test(source)
    )
  ).toBe(true)
})

test('preserves one shared attachment validator', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final app keeps one environment-neutral attachmentTypeSchema implementation that accepts image, text, and file and rejects unsupported values. The Client Component imports that shared validator without importing the database schema. The database schema may import or re-export the same shared validator, but the solution must not duplicate the validator, remove validation, replace it with an always-successful check, or mark the shared validator itself as server-only. The page heading, upload control, and validation feedback remain available.`
  )
})

test('verifies the client-graph fix and boundary guard', async () => {
  await expect(transcript).toSatisfyCriterion(
    `After making the source changes, the agent completes a production build and correctly explains that importing the neutral shared validator directly removes the database schema from the client graph, while the server-only marker is a negative boundary guard that prevents the same mistake from returning. Merely adding server-only without fixing the Client Component import is insufficient.`
  )
})
