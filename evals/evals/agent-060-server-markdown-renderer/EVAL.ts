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

function sources(): Array<{ path: string; content: string }> {
  return ['app', 'components']
    .flatMap((directory) => sourceFiles(join(process.cwd(), directory)))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }))
}

function isClientModule(content: string): boolean {
  return /^\s*['"]use client['"]/m.test(content)
}

test('keeps the Markdown rendering stack out of client modules', () => {
  const files = sources()
  const clientSources = files
    .filter(({ content }) => isClientModule(content))
    .map(({ content }) => content)
    .join('\n')

  expect(clientSources).not.toMatch(
    /from\s*['"](?:react-markdown|remark-gfm|rehype-highlight)['"]/
  )
  expect(files.map(({ content }) => content).join('\n')).toMatch(
    /react-markdown/
  )
})

test('renders the display-only content from a server boundary', () => {
  const files = sources()
  const markdownModules = files.filter(({ content }) =>
    /from\s*['"]react-markdown['"]/.test(content)
  )

  expect(markdownModules.length).toBeGreaterThan(0)
  expect(markdownModules.every(({ content }) => !isClientModule(content))).toBe(
    true
  )
})

test('preserves the formatted release notes', () => {
  const content = sources()
    .map((file) => file.content)
    .join('\n')

  expect(content).toContain('Release Notes')
  expect(content).toContain('## Quarterly plan')
  expect(content).toContain('- Ship the browser performance work')
  expect(content).toContain('- Keep the release notes readable')
  expect(content).toContain("const target = 'fast initial load'")
  expect(content).toMatch(/remark-gfm/)
  expect(content).toMatch(/rehype-highlight/)
})

test('uses analyzer evidence and verifies the optimization', () => {
  const transcript = readFileSync(transcriptPath(), 'utf8')
  const analyzerRuns = transcript.match(/experimental-analyze/g) ?? []

  expect(transcript.trim()).not.toBe('')
  expect(analyzerRuns.length).toBeGreaterThanOrEqual(2)
  expect(transcript).toMatch(/(?:query|initial[_ -]?load|scope)/i)
  expect(transcript).toMatch(/react-markdown/i)
  expect(transcript).toMatch(/remark-gfm/i)
  expect(transcript).toMatch(/rehype-highlight/i)
  expect(transcript).toMatch(/(?:package|source|importer)/i)
  expect(transcript).toMatch(
    /(?:next\s+build|pnpm\s+(?:run\s+)?build|npm\s+run\s+build)/i
  )
})
