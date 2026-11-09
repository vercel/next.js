import { beforeAll, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runBrowserJsEval } from '../../lib/bundle-optimizer/browser-js.js'
import { measureBrowserJs } from './__eval__/measure-browser-js.js'
import type { BrowserMeasurement as Measurement } from '../../lib/bundle-optimizer/browser-js.js'

type BrowserDetails = {
  content: { statusLabelsPreserved: boolean }
}

type BrowserMeasurement = Measurement<BrowserDetails>

let before: BrowserMeasurement
let after: BrowserMeasurement
const budgetBytes = 170_000

beforeAll(async () => {
  const measured = await runBrowserJsEval<BrowserDetails>(
    budgetBytes,
    measureBrowserJs
  )
  before = measured.before
  after = measured.after
}, 360_000)

test('consolidates the duplicate lodash runtime', () => {
  const rootPackage = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  )
  const legacyPackage = JSON.parse(
    readFileSync(
      join(process.cwd(), 'packages/legacy-widget/package.json'),
      'utf8'
    )
  )

  expect(rootPackage.dependencies?.lodash).toBeTruthy()
  expect(legacyPackage.dependencies?.lodash).toBeTruthy()

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
  expect(versions.size).toBe(1)
})

test('renders both transformed status labels in the browser', () => {
  expect(after.content.statusLabelsPreserved).toBe(true)
})

test('keeps initial browser JavaScript under 170,000 bytes', () => {
  expect(after.initial.encodedBytes).toBeGreaterThan(0)
  expect(after.initial.encodedBytes).toBeLessThanOrEqual(budgetBytes)
})

test('reduces initial browser JavaScript', () => {
  expect(after.initial.encodedBytes).toBeLessThan(before.initial.encodedBytes)
})
