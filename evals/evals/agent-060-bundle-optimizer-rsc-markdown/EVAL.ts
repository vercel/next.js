import { beforeAll, expect, test } from 'vitest'
import { runBrowserJsEval } from '../../lib/bundle-optimizer/browser-js.js'
import { measureBrowserJs } from './__eval__/measure-browser-js.js'
import type { BrowserMeasurement as Measurement } from '../../lib/bundle-optimizer/browser-js.js'

type BrowserDetails = {
  content: { formattedReleaseNotes: boolean }
  markdownSources: string[]
}

type BrowserMeasurement = Measurement<BrowserDetails>

let before: BrowserMeasurement
let after: BrowserMeasurement
const budgetBytes = 150_000

beforeAll(async () => {
  const measured = await runBrowserJsEval<BrowserDetails>(
    budgetBytes,
    measureBrowserJs
  )
  before = measured.before
  after = measured.after
}, 360_000)

test('builds and preserves the rendered release notes', () => {
  expect(after.content.formattedReleaseNotes).toBe(true)
})

test('keeps Markdown rendering modules out of browser chunks', () => {
  expect(before.markdownSources).toEqual(
    expect.arrayContaining([expect.stringMatching(/\/react-markdown\//)])
  )
  expect(after.markdownSources).toEqual([])
})

test('keeps initial browser JavaScript under 150,000 bytes', () => {
  expect(after.initial.encodedBytes).toBeGreaterThan(0)
  expect(after.initial.encodedBytes).toBeLessThanOrEqual(budgetBytes)
})

test('reduces initial browser JavaScript', () => {
  expect(after.initial.encodedBytes).toBeLessThan(before.initial.encodedBytes)
})
