import { beforeAll, expect, test } from 'vitest'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as BrowserJs from '../../lib/bundle-optimizer/browser-js.js'
import type {
  BrowserMeasurement as Measurement,
  JavaScriptSummary,
} from '../../lib/bundle-optimizer/browser-js.js'

type BrowserDetails = {
  initial: JavaScriptSummary & {
    editorLoaded: boolean
  }
  editor: { preloaded: boolean }
}

type BrowserMeasurement = Measurement<BrowserDetails>

let before: BrowserMeasurement
let after: BrowserMeasurement
const budgetBytes = 200_000

beforeAll(async () => {
  const utilsSource = process.env.NEXT_EVAL_BROWSER_JS_UTILS_SOURCE
  if (!utilsSource) throw new Error('Missing runner-provided browser utilities')
  const utilsPath = join(process.cwd(), '__agent_eval__', 'browser-js.mjs')
  mkdirSync(join(process.cwd(), '__agent_eval__'), { recursive: true })
  writeFileSync(utilsPath, utilsSource)
  // The SDK restores EVAL.ts after agent edits, but has no pre-validation hook.
  const { runBrowserJsEval }: typeof BrowserJs = await import(
    pathToFileURL(utilsPath).href
  )
  const measured = runBrowserJsEval<BrowserDetails>(budgetBytes)
  before = measured.before
  after = measured.after
}, 360_000)

test('builds and preserves a functioning editor', () => {
  expect(after.editor).toBeDefined()
})

test('keeps initial browser JavaScript under 200,000 bytes', () => {
  expect(after.initial.encodedBytes).toBeGreaterThan(0)
  expect(after.initial.encodedBytes).toBeLessThanOrEqual(budgetBytes)
})

test('reduces initial browser JavaScript', () => {
  expect(after.initial.encodedBytes).toBeLessThan(before.initial.encodedBytes)
})

test('does not load the editor before an interaction', () => {
  expect(after.initial.editorLoaded).toBe(false)
})

test('preloads the editor on pointer hover', () => {
  expect(after.editor?.preloaded).toBe(true)
})

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

test('preserves the click-gated JavaScript editor', () => {
  const sources = sourceContents()

  expect(sources).toContain('Formula Workspace')
  expect(sources).toContain('Open formula editor')
  expect(sources).toContain('revenue - costs')
  expect(sources).toMatch(/@uiw\/react-codemirror/)
  expect(sources).toMatch(/@codemirror\/lang-javascript/)
  expect(sources).toMatch(/useState\s*\(\s*false\s*\)/)
  expect(sources).toMatch(/\{\s*\w+\s*(?:\?|&&)\s*\(?\s*<\w+/)
})
