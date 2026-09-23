import { expect, test } from 'vitest'
import { transcriptPath } from '@vercel/agent-eval/eval'
import { readFileSync, readdirSync } from 'node:fs'
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

function sourceContents(): string {
  return ['app', 'components']
    .flatMap((directory) => sourceFiles(join(process.cwd(), directory)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
}

test('loads the CodeMirror editor through an async boundary', () => {
  const sources = sourceContents()

  expect(sources).toContain('Open formula editor')
  expect(sources).toMatch(/@uiw\/react-codemirror/)
  expect(sources).not.toMatch(
    /import\s+(?!type\b)[^'";]+from\s*['"].*heavy-editor['"]/
  )
  expect(sources).toMatch(/dynamic\s*\(/)
  expect(sources).toMatch(/import\s*\(\s*['"].*heavy-editor['"]\s*\)/)
})

test('preloads the editor on pointer and keyboard intent', () => {
  const sources = sourceContents()

  expect(sources).toMatch(
    /on(?:Mouse|Pointer)Enter\s*=\s*\{[\s\S]{0,160}(?:preload|load|import)/
  )
  expect(sources).toMatch(
    /onFocus\s*=\s*\{[\s\S]{0,160}(?:preload|load|import)/
  )
})

test('preserves the click-gated JavaScript editor', () => {
  const sources = sourceContents()

  expect(sources).toContain('Formula Workspace')
  expect(sources).toContain('Open formula editor')
  expect(sources).toContain('revenue - costs')
  expect(sources).toMatch(/@uiw\/react-codemirror/)
  expect(sources).toMatch(/@codemirror\/lang-javascript/)
  expect(sources).toMatch(/useState\s*\(\s*false\s*\)/)
  expect(sources).toMatch(/\{\s*\w+\s*&&\s*<\w+/)
})

test('uses analyzer evidence and verifies the optimization', () => {
  const transcript = readFileSync(transcriptPath(), 'utf8')
  const analyzerRuns = transcript.match(/experimental-analyze/g) ?? []

  expect(transcript.trim()).not.toBe('')
  expect(analyzerRuns.length).toBeGreaterThanOrEqual(2)
  expect(transcript).toMatch(/(?:query|initial[_ -]?load|scope)/i)
  expect(transcript).toMatch(/(?:CodeMirror|@uiw\/react-codemirror)/i)
  expect(transcript).toMatch(/(?:package|source|importer)/i)
  expect(transcript).toMatch(
    /(?:next\s+build|pnpm\s+(?:run\s+)?build|npm\s+run\s+build)/i
  )
})
