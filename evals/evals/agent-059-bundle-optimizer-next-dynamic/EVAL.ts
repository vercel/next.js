import { beforeAll, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runBrowserJsEval } from '../../lib/bundle-optimizer/browser-js.js'
import { measureBrowserJs } from './__eval__/measure-browser-js.js'
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
  const measured = await runBrowserJsEval<BrowserDetails>(
    budgetBytes,
    measureBrowserJs
  )
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

test('imports next/dynamic for the editor async boundary', () => {
  const sources = ['app', 'components']
    .flatMap((directory) =>
      readdirSync(join(process.cwd(), directory), {
        recursive: true,
        encoding: 'utf8',
      })
        .filter((path) => /\.[cm]?[jt]sx?$/.test(path))
        .map((path) => join(directory, path))
    )
    .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
    .join('\n')
  expect(sources).toMatch(/from\s*['"]next\/dynamic['"]/)
})
