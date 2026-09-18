import { expect, test } from 'vitest'
import { environment, transcript } from '@vercel/agent-eval/eval'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function sourceFiles(directory = process.cwd()): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['.next', 'node_modules'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(path))
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path)
  }
  return files
}

function sourceContents(): Array<{ path: string; content: string }> {
  return ['app', 'components', 'packages']
    .flatMap((directory) => sourceFiles(join(process.cwd(), directory)))
    .map((path) => ({
      path,
      content: readFileSync(path, 'utf8'),
    }))
}

function isClientModule(content: string): boolean {
  return /^\s*['"]use client['"]/m.test(content)
}

test('loads the heavy editor only after interaction', () => {
  const sources = sourceContents()
  const combined = sources.map(({ content }) => content).join('\n')

  expect(combined).toContain('Open formula editor')
  expect(combined).toMatch(/@uiw\/react-codemirror/)
  expect(combined).not.toMatch(
    /import\s+(?!type\b)[^'";]+from\s*['"].*heavy-editor['"]/
  )
  expect(combined).toMatch(
    /dynamic\s*\([\s\S]{0,200}import\s*\(\s*['"].*heavy-editor['"]\s*\)/
  )
})

test('keeps display-only Markdown parsing out of client modules', () => {
  const sources = sourceContents()
  const clientSources = sources
    .filter(({ content }) => isClientModule(content))
    .map(({ content }) => content)
    .join('\n')

  expect(clientSources).not.toMatch(
    /from\s*['"](?:react-markdown|remark-gfm|rehype-highlight)['"]/
  )
  expect(
    isClientModule(readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8'))
  ).toBe(false)
})

test('consolidates the duplicate same-major lodash runtime', () => {
  const rootPackage = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  )
  const legacyPackage = JSON.parse(
    readFileSync(
      join(process.cwd(), 'packages/legacy-widget/package.json'),
      'utf8'
    )
  )
  const rootRange = rootPackage.dependencies?.lodash
  const legacyRange = legacyPackage.dependencies?.lodash

  if (rootRange && legacyRange) {
    expect(legacyRange).not.toBe('4.17.20')
  }

  const lockPath = join(process.cwd(), 'package-lock.json')
  expect(existsSync(lockPath)).toBe(true)
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const versions = new Set<string>()
  for (const [path, entry] of Object.entries(lock.packages ?? {}) as Array<
    [string, { version?: string }]
  >) {
    if (/(?:^|\/)node_modules\/lodash$/.test(path) && entry.version) {
      versions.add(entry.version)
    }
  }
  expect(versions.size).toBeLessThanOrEqual(1)
})

test('preserves the application while narrowing the client boundary', async () => {
  await expect(environment).toSatisfyCriterion(
    `The final application preserves all original visible behavior: a "Project Notes" heading; rendered Quarterly plan Markdown with a bulleted list and highlighted JavaScript code block; Current status and Legacy status labels with their original transformed text; and a button that opens a working JavaScript-capable formula editor initialized to "revenue - costs". The editor is loaded lazily only when needed, display-only Markdown rendering does not ship its parser and highlighting stack in an initial Client Component, and the coarse page/client boundary is narrowed. The agent does not satisfy this by deleting, replacing with static placeholder text, or disabling any feature, type check, or build step. Equivalent safe component structures are acceptable.`
  )
})

test('uses analyzer evidence and verifies each optimization', async () => {
  await expect(transcript).toSatisfyCriterion(
    `The agent follows the browser initial-load optimizer workflow rather than making source-only guesses. It discovers or invokes the experimental-analyze CLI, generates a before baseline, queries the / route with environment client and initial load scope, inspects package/source and importer evidence, and regenerates analyzer output after changes. It correctly treats lazy loading as an initial-to-async scope migration even if eventual route bytes remain, while server migration and duplicate removal are verified through reduced client attribution. It checks a production build and relevant interaction behavior, and does not claim analyzer compressed attribution is observed network transfer. Minor command retries are acceptable; entirely skipping before/after analyzer evidence is not.`
  )
})
